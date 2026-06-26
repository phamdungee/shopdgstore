const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { fulfillOrder } = require('../fulfillment/vendorRouter');
const {
  normalizeString,
  safeUser,
  makePublicCode,
  safeOrder,
  ORDER_PUBLIC_SELECT,
  deductUserBalance,
  addUserBalance,
  writeWalletTransaction,
  purchaseCostSnapshot,
  notifyPurchaseFailure
} = require('../services/storeService');

router.post('/orders', authMiddleware, async (req, res) => {
  let deducted = null;
  let order = null;
  let product = null;
  let variant = null;

  try {
    const userId = req.user.userId;
    const productSlug = normalizeString(req.body.productSlug);
    const variantName = normalizeString(req.body.variantName);
    const quantity = Math.max(1, Math.floor(Number(req.body.quantity || 1)));

    if (!productSlug || !variantName) {
      return res.status(400).json({ ok: false, message: 'Thông tin đơn hàng không hợp lệ' });
    }

    const { data: foundProduct, error: productErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', productSlug)
      .single();

    if (productErr || !foundProduct) {
      console.error('Order product lookup error:', productErr);
      return res.status(404).json({ ok: false, message: 'Sản phẩm không tồn tại hoặc đã bị ẩn' });
    }

    product = foundProduct;
    if (product.is_active === false || product.active === false || Number(product.stock) === 0) {
      return res.status(400).json({ ok: false, message: 'Sản phẩm tạm hết hàng' });
    }

    variant = (Array.isArray(product.variants) ? product.variants : []).find(item => item.name === variantName);
    if (!variant) {
      return res.status(400).json({ ok: false, message: 'Gói sản phẩm không hợp lệ' });
    }

    const unitPrice = Math.max(0, Math.floor(Number(variant.price || 0)));
    const totalPrice = quantity * unitPrice;
    if (totalPrice <= 0) {
      return res.status(400).json({ ok: false, message: 'Giá sản phẩm không hợp lệ' });
    }

    const costSnapshot = purchaseCostSnapshot(product, variant, quantity, totalPrice);
    const orderCode = makePublicCode('DG');
    const purchaseTransactionCode = makePublicCode('BUY');

    deducted = await deductUserBalance(userId, totalPrice);

    const { data: newOrder, error: orderError } = await supabase
      .from('store_orders')
      .insert({
        user_id: userId,
        order_code: orderCode,
        product_slug: productSlug,
        product_name: product.name,
        variant_name: variantName,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        cost_amount: costSnapshot.costAmount,
        profit: costSnapshot.profit,
        status: 'processing',
        delivery_text: `Đơn ${orderCode} đang được xử lý tự động.`,
        response_data: {
          source: 'processing',
          vendor_id: variant.vendor_id || product.vendor_id || null,
          vendor_product_code: variant.vendor_product_code || product.vendor_product_code || variant.provider_service_id || null,
          unit_cost: costSnapshot.unitCost
        }
      })
      .select(ORDER_PUBLIC_SELECT)
      .single();

    if (orderError || !newOrder) {
      console.error('Create processing order error:', orderError);
      const refunded = await addUserBalance(userId, totalPrice);
      await writeWalletTransaction({
        user_id: userId,
        transaction_code: makePublicCode('REF'),
        type: 'refund',
        amount: totalPrice,
        balance_before: refunded.balanceBefore,
        balance_after: refunded.balanceAfter,
        content: `Hoàn tiền do không tạo được đơn ${orderCode}`,
        status: 'paid'
      });
      return res.status(500).json({
        ok: false,
        message: 'Không lưu được đơn hàng, số dư đã được hoàn lại',
        user: safeUser(refunded.user)
      });
    }

    order = newOrder;
    await writeWalletTransaction({
      user_id: userId,
      transaction_code: purchaseTransactionCode,
      type: 'purchase',
      amount: -totalPrice,
      balance_before: deducted.balanceBefore,
      balance_after: deducted.balanceAfter,
      content: `Mua ${product.name} - ${variantName} x${quantity} (${orderCode})`,
      related_order_id: order.id,
      status: 'paid'
    });

    const fulfillment = await fulfillOrder({
      supabase,
      product,
      variant,
      productSlug,
      variantName,
      quantity,
      orderCode,
      orderId: order.id,
      user: deducted.user
    });

    if (!fulfillment.ok) {
      const refunded = await addUserBalance(userId, totalPrice);
      const refundMessage = `Nguồn hàng lỗi hoặc hết hàng. Hệ thống đã hoàn ${totalPrice.toLocaleString('vi-VN')}đ vào ví của bạn.`;

      const { data: refundedOrder, error: refundOrderError } = await supabase
        .from('store_orders')
        .update({
          status: 'refunded',
          delivery_text: refundMessage,
          response_data: {
            source: 'refund',
            reason: fulfillment.message,
            vendor_response: fulfillment.responseData || null,
            fallback: fulfillment.fallback || null
          }
        })
        .eq('id', order.id)
        .select(ORDER_PUBLIC_SELECT)
        .single();

      if (refundOrderError) {
        console.error('Update refunded order warning:', refundOrderError);
      }

      await writeWalletTransaction({
        user_id: userId,
        transaction_code: makePublicCode('REF'),
        type: 'refund',
        amount: totalPrice,
        balance_before: refunded.balanceBefore,
        balance_after: refunded.balanceAfter,
        content: `Hoàn tiền ${product.name} - ${variantName} x${quantity} (${orderCode})`,
        related_order_id: order.id,
        status: 'paid'
      });

      await notifyPurchaseFailure({
        user: deducted.user,
        product,
        variantName,
        quantity,
        order,
        reason: fulfillment.message,
        responseData: fulfillment.responseData || fulfillment
      });

      return res.status(502).json({
        ok: false,
        message: refundMessage,
        user: safeUser(refunded.user),
        order: safeOrder(refundedOrder || { ...order, status: 'refunded', delivery_text: refundMessage }),
        flow: {
          stage1: { status: 'success', message: 'Đã trừ số dư và tạo đơn processing.', timestamp: new Date().toISOString() },
          stage2: { status: 'failed', message: fulfillment.message, responseData: fulfillment.responseData || null, timestamp: new Date().toISOString() },
          stage3: { status: 'refunded', message: 'Đã hoàn tiền nội bộ cho khách.', timestamp: new Date().toISOString() }
        }
      });
    }

    if (Array.isArray(fulfillment.stockIds) && fulfillment.stockIds.length > 0) {
      const { data: claimedStocks, error: claimStockError } = await supabase
        .from('product_stocks')
        .update({
          is_sold: true,
          sold_at: new Date().toISOString(),
          related_order_id: order.id
        })
        .in('id', fulfillment.stockIds)
        .eq('is_sold', false)
        .select('id');

      if (claimStockError || !claimedStocks || claimedStocks.length < quantity) {
        if (claimedStocks && claimedStocks.length > 0) {
          await supabase
            .from('product_stocks')
            .update({
              is_sold: false,
              sold_at: null,
              related_order_id: null
            })
            .in('id', claimedStocks.map(item => item.id))
            .eq('related_order_id', order.id);
        }

        const refunded = await addUserBalance(userId, totalPrice);
        const refundMessage = `Kho vừa thay đổi, hệ thống đã hoàn ${totalPrice.toLocaleString('vi-VN')}đ vào ví của bạn.`;

        const { data: refundedOrder } = await supabase
          .from('store_orders')
          .update({
            status: 'refunded',
            delivery_text: refundMessage,
            response_data: {
              source: 'refund',
              reason: claimStockError ? claimStockError.message : 'Không claim đủ kho nội bộ',
              requested: quantity,
              claimed: claimedStocks ? claimedStocks.length : 0
            }
          })
          .eq('id', order.id)
          .select(ORDER_PUBLIC_SELECT)
          .single();

        await writeWalletTransaction({
          user_id: userId,
          transaction_code: makePublicCode('REF'),
          type: 'refund',
          amount: totalPrice,
          balance_before: refunded.balanceBefore,
          balance_after: refunded.balanceAfter,
          content: `Hoàn tiền do kho thay đổi ${product.name} - ${variantName} (${orderCode})`,
          related_order_id: order.id,
          status: 'paid'
        });

        await notifyPurchaseFailure({
          user: deducted.user,
          product,
          variantName,
          quantity,
          order,
          reason: claimStockError ? claimStockError.message : 'Không claim đủ kho nội bộ',
          responseData: { requested: quantity, claimed: claimedStocks ? claimedStocks.length : 0 }
        });

        return res.status(409).json({
          ok: false,
          message: refundMessage,
          user: safeUser(refunded.user),
          order: safeOrder(refundedOrder || { ...order, status: 'refunded', delivery_text: refundMessage })
        });
      }
    }

    const { data: completedOrder, error: completeError } = await supabase
      .from('store_orders')
      .update({
        status: 'completed',
        delivery_text: fulfillment.deliveryText,
        response_data: fulfillment.responseData || null
      })
      .eq('id', order.id)
      .select(ORDER_PUBLIC_SELECT)
      .single();

    if (completeError || !completedOrder) {
      console.error('Complete order update error:', completeError);
      const refunded = await addUserBalance(userId, totalPrice);
      await writeWalletTransaction({
        user_id: userId,
        transaction_code: makePublicCode('REF'),
        type: 'refund',
        amount: totalPrice,
        balance_before: refunded.balanceBefore,
        balance_after: refunded.balanceAfter,
        content: `Hoàn tiền do không cập nhật được đơn ${orderCode}`,
        related_order_id: order.id,
        status: 'paid'
      });
      await supabase
        .from('store_orders')
        .update({
          status: 'refunded',
          delivery_text: 'Không cập nhật được trạng thái giao hàng, hệ thống đã hoàn tiền.',
          response_data: {
            source: 'refund',
            reason: completeError ? completeError.message : 'Complete order update failed'
          }
        })
        .eq('id', order.id);

      return res.status(500).json({
        ok: false,
        message: 'Không cập nhật được trạng thái giao hàng, số dư đã được hoàn lại',
        user: safeUser(refunded.user)
      });
    }

    return res.status(201).json({
      ok: true,
      message: 'Mua hàng và giao hàng tự động thành công!',
      user: safeUser(deducted.user),
      order: safeOrder(completedOrder),
      flow: {
        stage1: { status: 'success', message: 'Đã trừ số dư và tạo đơn processing.', timestamp: new Date().toISOString() },
        stage2: { status: 'success', message: `Fulfillment thành công qua ${fulfillment.vendor}.`, responseData: fulfillment.responseData || null, timestamp: new Date().toISOString() },
        stage3: { status: 'completed', message: 'Đơn đã hoàn thành và hàng đã được giao.', timestamp: new Date().toISOString() }
      }
    });
  } catch (err) {
    console.error('Create order server error:', err);

    if (deducted && !order && product && variant) {
      try {
        const totalPrice = Number(variant.price || 0) * Math.max(1, Math.floor(Number(req.body.quantity || 1)));
        const refunded = await addUserBalance(req.user.userId, totalPrice);
        return res.status(500).json({
          ok: false,
          message: 'Lỗi server khi tạo đơn hàng, số dư đã được hoàn lại',
          user: safeUser(refunded.user)
        });
      } catch (refundErr) {
        console.error('Emergency refund failed:', refundErr);
      }
    }

    return res.status(err.statusCode || 500).json({
      ok: false,
      message: err.message || 'Lỗi server khi tạo đơn hàng'
    });
  }
});

router.post('/orders-legacy-disabled', authMiddleware, async (req, res) => {
  return res.status(410).json({
    ok: false,
    message: 'Luồng mua hàng cũ đã tắt. Hãy dùng /api/orders.'
  });

  try {
    const userId = req.user.userId;
    const productSlug = normalizeString(req.body.productSlug);
    const variantName = normalizeString(req.body.variantName);
    const quantity = Math.max(1, Math.floor(Number(req.body.quantity || 1)));

    if (!productSlug || !variantName) {
      return res.status(400).json({ ok: false, message: 'Thông tin đơn hàng không hợp lệ' });
    }

    // 1. LẤY THÔNG TIN SẢN PHẨM VÀ ĐỊNH GIÁ TỪ DATABASE
    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', productSlug)
      .single();

    if (productErr || !product) {
      console.error('Order product lookup error:', productErr);
      return res.status(404).json({ ok: false, message: 'Sản phẩm không tồn tại hoặc đã bị ẩn' });
    }

    const variant = (product.variants || []).find(v => v.name === variantName);
    if (!variant) {
      return res.status(400).json({ ok: false, message: 'Gói sản phẩm không hợp lệ' });
    }

    const dbUnitPrice = Number(variant.price || 0);
    const totalPrice = quantity * dbUnitPrice;
    const providerServiceId = variant.provider_service_id;

    // 2. KIỂM TRA SỐ DƯ TÀI KHOẢN KHÁCH HÀNG
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
    }

    const balanceBefore = Number(user.balance || 0);
    if (balanceBefore < totalPrice) {
      return res.status(400).json({ ok: false, message: 'Số dư không đủ để mua sản phẩm' });
    }

    const balanceAfter = balanceBefore - totalPrice;
    const orderCode = makePublicCode('DG');
    const transactionCode = makePublicCode('BUY');
    let deliveryText = `Đơn ${orderCode} đã được ghi nhận. Admin sẽ xử lý và giao sản phẩm trong lịch sử đơn hàng.`;
    let isDelivered = false;

    // Khởi tạo thông tin chi tiết luồng xử lý tự động 3 giai đoạn (Data Flow)
    const flowMetadata = {
      stage1: { 
        status: 'success', 
        message: 'Gửi yêu cầu đặt hàng từ Web/Client thành công. Tài khoản hợp lệ, đủ số dư.',
        timestamp: new Date().toISOString()
      },
      stage2: { 
        status: 'processing', 
        message: 'Đang liên hệ nhà cung cấp / kiểm tra kho hàng...',
        provider: 'Hệ thống DG Store',
        timestamp: new Date().toISOString()
      },
      stage3: { 
        status: 'pending', 
        message: 'Chờ ghi nhận đơn hàng và kích hoạt bàn giao sản phẩm.',
        timestamp: new Date().toISOString()
      }
    };

    // 3. AUTO-DELIVERY LOGIC:
    // Hướng 1: Kiểm tra xem có kho hàng sẵn trong product_stocks không
    let stockItems = [];
    try {
      const { data: checkStock, error: stockErr } = await supabase
        .from('product_stocks')
        .select('id, account_data')
        .eq('product_slug', productSlug)
        .eq('variant_name', variantName)
        .eq('is_sold', false)
        .limit(quantity);

      if (!stockErr && checkStock && checkStock.length >= quantity) {
        stockItems = checkStock;
      }
    } catch (e) {
      console.log('product_stocks query skipped or failed, falling back...');
    }

    if (stockItems.length >= quantity) {
      // Giao hàng từ kho hàng nội bộ
      const accountsList = stockItems.map(item => item.account_data).join('\n');
      deliveryText = `Cảm ơn bạn đã mua hàng! Dưới đây là tài khoản của bạn:\n\n${accountsList}`;
      isDelivered = true;
      
      flowMetadata.stage2 = {
        status: 'success',
        message: `Lấy sản phẩm thành công từ kho hàng nội bộ (${quantity} tài khoản).`,
        provider: 'Kho hàng DG Store',
        timestamp: new Date().toISOString()
      };
      flowMetadata.stage3 = {
        status: 'success',
        message: 'Cập nhật trạng thái cơ sở dữ liệu: Giảm số dư, trừ tồn kho và bàn giao tài khoản thành công.',
        timestamp: new Date().toISOString()
      };
    } else if (providerServiceId) {
      // Hướng 2: Gọi API đối tác bên thứ 3 (Ví dụ: Trạm MMO) nếu được cấu hình
      const providerApiUrl = process.env.PROVIDER_API_URL;
      const providerApiKey = process.env.PROVIDER_API_KEY;

      if (providerApiUrl && providerApiKey) {
        flowMetadata.stage2.provider = 'API Đối Tác Ngoài';
        try {
          const providerRes = await axios.post(providerApiUrl, {
            key: providerApiKey,
            action: 'buy',
            service: providerServiceId,
            quantity: quantity
          });

          if (providerRes.data && providerRes.data.status === 'success' && providerRes.data.data) {
            const accountsList = Array.isArray(providerRes.data.data) 
              ? providerRes.data.data.join('\n') 
              : String(providerRes.data.data);
            deliveryText = `Cảm ơn bạn đã mua hàng! Tài khoản được tự động giao qua API đối tác:\n\n${accountsList}`;
            isDelivered = true;
            
            flowMetadata.stage2 = {
              status: 'success',
              message: 'Gọi API nhà cung cấp thành công. Đối tác đã bàn giao tài khoản tự động.',
              provider: 'API Đối Tác Ngoài',
              timestamp: new Date().toISOString()
            };
            flowMetadata.stage3 = {
              status: 'success',
              message: 'Cơ sở dữ liệu ghi nhận đơn hàng hoàn thành tự động qua API đối tác.',
              timestamp: new Date().toISOString()
            };
          } else {
            console.error('Partner API purchase failed:', providerRes.data);
            deliveryText = `Đơn hàng đang chờ xử lý thủ công (Nhà cung cấp API quá tải hoặc hết hàng). Vui lòng liên hệ Admin.`;
            
            flowMetadata.stage2 = {
              status: 'warning',
              message: 'Gọi API đối tác thành công nhưng hết hàng hoặc lỗi số dư đối tác. Chuyển sang hàng chờ xử lý.',
              provider: 'API Đối Tác Ngoài',
              timestamp: new Date().toISOString()
            };
            flowMetadata.stage3 = {
              status: 'success',
              message: 'Cơ sở dữ liệu ghi nhận đơn hàng ở trạng thái Chờ xử lý thủ công.',
              timestamp: new Date().toISOString()
            };
          }
        } catch (apiErr) {
          console.error('Call Partner API Error:', apiErr.message);
          deliveryText = `Đơn hàng đang chờ xử lý thủ công (Không kết nối được API nhà cung cấp). Vui lòng liên hệ Admin.`;
          
          flowMetadata.stage2 = {
            status: 'warning',
            message: `Lỗi kết nối API đối tác: ${apiErr.message}. Chuyển sang hàng chờ xử lý.`,
            provider: 'API Đối Tác Ngoài',
            timestamp: new Date().toISOString()
          };
          flowMetadata.stage3 = {
            status: 'success',
            message: 'Cơ sở dữ liệu ghi nhận đơn hàng ở trạng thái Chờ xử lý thủ công.',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        flowMetadata.stage2 = {
          status: 'warning',
          message: 'Sản phẩm yêu cầu API ngoài nhưng chưa được cấu hình khóa hoặc URL. Chuyển sang xử lý thủ công.',
          provider: 'Hệ thống DG Store',
          timestamp: new Date().toISOString()
        };
        flowMetadata.stage3 = {
          status: 'success',
          message: 'Đơn hàng được ghi nhận và đưa vào hàng chờ xử lý thủ công của Admin.',
          timestamp: new Date().toISOString()
        };
      }
    } else {
      // Không có API đối tác và không có kho nội bộ
      flowMetadata.stage2 = {
        status: 'warning',
        message: 'Sản phẩm xử lý thủ công qua Admin (Không cấu hình kho nội bộ hoặc API ngoài).',
        provider: 'Hệ thống DG Store',
        timestamp: new Date().toISOString()
      };
      flowMetadata.stage3 = {
        status: 'success',
        message: 'Đã tạo đơn hàng thành công. Chờ Admin duyệt và kích hoạt thủ công.',
        timestamp: new Date().toISOString()
      };
    }

    // 4. TRỪ TIỀN KHÁCH HÀNG
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ balance: balanceAfter })
      .eq('id', userId)
      .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
      .single();

    if (updateError || !updatedUser) {
      console.error('Purchase balance update error:', updateError);
      return res.status(500).json({ ok: false, message: 'Không trừ được số dư tài khoản' });
    }

    // 5. TẠO ĐƠN HÀNG VÀ GHI DỮ LIỆU GIAO HÀNG
    const { data: order, error: orderError } = await supabase
      .from('store_orders')
      .insert({
        user_id: userId,
        order_code: orderCode,
        product_slug: productSlug,
        product_name: product.name,
        variant_name: variantName,
        quantity,
        unit_price: dbUnitPrice,
        total_price: totalPrice,
        status: isDelivered ? 'completed' : 'pending',
        delivery_text: deliveryText
      })
      .select('id, order_code, product_slug, product_name, variant_name, quantity, unit_price, total_price, status, delivery_text, created_at')
      .single();

    if (orderError || !order) {
      console.error('Create order error:', orderError);
      // Hoàn tiền nếu lỗi database
      await supabase.from('users').update({ balance: balanceBefore }).eq('id', userId);
      return res.status(500).json({ ok: false, message: 'Không lưu được đơn hàng, số dư đã được hoàn lại' });
    }

    // 6. CẬP NHẬT TRẠNG THÁI KHO NẾU GIAO HÀNG TỪ KHO
    if (isDelivered && stockItems.length > 0) {
      try {
        const stockIds = stockItems.map(item => item.id);
        await supabase
          .from('product_stocks')
          .update({
            is_sold: true,
            sold_at: new Date().toISOString(),
            related_order_id: order.id
          })
          .in('id', stockIds);
      } catch (stockUpdErr) {
        console.error('Stock update warning:', stockUpdErr.message);
      }
    }

    // 7. GHI LỊCH SỬ BIẾN ĐỘNG SỐ DƯ
    const { error: transactionError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        transaction_code: transactionCode,
        type: 'purchase',
        amount: -totalPrice,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        content: `Mua ${product.name} - ${variantName} x${quantity} (${orderCode})`,
        related_order_id: order.id,
        status: 'paid'
      });

    if (transactionError) {
      console.error('Create purchase transaction warning:', transactionError);
    }

    return res.status(201).json({
      ok: true,
      message: isDelivered ? 'Mua hàng và giao hàng tự động thành công!' : 'Mua hàng thành công! Đơn hàng đang được Admin xử lý.',
      user: safeUser(updatedUser),
      order: safeOrder(order),
      flow: flowMetadata
    });
  } catch (err) {
    console.error('Create order server error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi tạo đơn hàng' });
  }
});

module.exports = router;
