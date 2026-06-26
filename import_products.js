require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration in .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const defaultProducts = [
  {
    cat: 'netflix',
    icon: 'fa-tv',
    slug: 'netflix-premium-ultrahd-4k',
    name: 'Netflix Premium UltraHD 4K',
    desc: 'Tài khoản Netflix Premium xem phim chất lượng cao, giao tự động sau thanh toán.',
    long_desc: 'Tài khoản Netflix Premium UltraHD 4K xem phim chất lượng cao nhất, hỗ trợ trên mọi thiết bị. Giao hàng tự động sau khi thanh toán thành công.',
    image: 'assets/img/ảnh sản phẩm/giao-dien-moi-netflix-tren-chromecast.png',
    rate: '4.8',
    price: '15.000đ ~ 150.000đ',
    variants: [
      { name: '1 tuần', price: 15000, provider_service_id: null },
      { name: '1 tháng', price: 65000, provider_service_id: null },
      { name: '3 tháng', price: 150000, provider_service_id: null }
    ]
  },
  {
    cat: 'ai',
    icon: 'fa-robot',
    slug: 'chatgpt-plus-30-ngay',
    name: 'ChatGPT Plus 30 ngày',
    desc: 'Gói AI kích hoạt nhanh, phù hợp học tập, làm việc, viết nội dung và hỗ trợ code.',
    long_desc: 'Tài khoản ChatGPT Plus kích hoạt nhanh, hỗ trợ đầy đủ tính năng GPT-4o, DALL-E 3, Advanced Data Analysis. Phù hợp học tập, viết nội dung và hỗ trợ code.',
    image: 'assets/img/ảnh sản phẩm/temanggung-indonesia-july272023-simple-icon-260nw-2337921183.png',
    rate: '4.9',
    price: '29.000đ ~ 219.000đ',
    variants: [
      { name: '1 tuần', price: 29000, provider_service_id: null },
      { name: '1 tháng', price: 79000, provider_service_id: null },
      { name: '3 tháng', price: 219000, provider_service_id: null }
    ]
  },
  {
    cat: 'design',
    icon: 'fa-palette',
    slug: 'canva-pro-1-nam',
    name: 'Canva Pro 1 năm',
    desc: 'Canva Pro hỗ trợ thiết kế nhanh, nhiều template, phù hợp học tập và kinh doanh.',
    long_desc: 'Tài khoản Canva Pro nâng cấp trực tiếp chính chủ, không giới hạn tính năng thiết kế, hàng ngàn template cao cấp. Thích hợp cho học tập, kinh doanh và thiết kế nhanh.',
    image: 'assets/img/ảnh sản phẩm/canva-09482094.png',
    rate: '4.8',
    price: '15.000đ ~ 99.000đ',
    variants: [
      { name: '1 tháng', price: 15000, provider_service_id: null },
      { name: '6 tháng', price: 59000, provider_service_id: null },
      { name: '1 năm', price: 99000, provider_service_id: null }
    ]
  },
  {
    cat: 'design',
    icon: 'fa-pen-nib',
    slug: 'adobe-creative-cloud',
    name: 'Adobe Creative Cloud',
    desc: 'Gói công cụ thiết kế dành cho chỉnh ảnh, dựng nội dung và sáng tạo hình ảnh.',
    long_desc: 'Bản quyền Adobe Creative Cloud bao gồm Photoshop, Illustrator, Premiere Pro và toàn bộ ứng dụng Adobe. Kích hoạt trực tiếp trên tài khoản cá nhân của bạn.',
    image: 'assets/img/ảnh sản phẩm/canva-09482094.png',
    rate: '4.7',
    price: '60.000đ ~ 450.000đ',
    variants: [
      { name: '1 tuần', price: 60000, provider_service_id: null },
      { name: '1 tháng', price: 160000, provider_service_id: null },
      { name: '3 tháng', price: 450000, provider_service_id: null }
    ]
  },
  {
    cat: 'ai',
    icon: 'fa-brain',
    slug: 'midjourney-ai-private',
    name: 'Midjourney AI Private',
    desc: 'Dịch vụ tạo ảnh AI riêng tư, phù hợp thiết kế ý tưởng và sản xuất nội dung.',
    long_desc: 'Tài khoản Midjourney AI Private tạo ảnh chất lượng cao riêng tư không bị trôi bài. Thích hợp cho nhà thiết kế đồ họa, marketing, và phát triển nội dung.',
    image: 'assets/img/ảnh sản phẩm/temanggung-indonesia-july272023-simple-icon-260nw-2337921183.png',
    rate: '4.8',
    price: '95.000đ ~ 600.000đ',
    variants: [
      { name: '1 tuần', price: 95000, provider_service_id: null },
      { name: '1 tháng', price: 280000, provider_service_id: null },
      { name: '3 tháng', price: 600000, provider_service_id: null }
    ]
  },
  {
    cat: 'netflix',
    icon: 'fa-play',
    slug: 'youtube-premium-6-thang',
    name: 'YouTube Premium 6 tháng',
    desc: 'YouTube Premium không quảng cáo, nghe nền và dùng YouTube Music trong thời hạn gói.',
    long_desc: 'Nâng cấp YouTube Premium trực tiếp trên email chính chủ, không quảng cáo, nghe nhạc tắt màn hình và trải nghiệm YouTube Music Premium miễn phí.',
    image: 'assets/img/ảnh sản phẩm/Youtube_logo.png',
    rate: '4.9',
    price: '35.000đ ~ 290.000đ',
    variants: [
      { name: '1 tháng', price: 35000, provider_service_id: null },
      { name: '3 tháng', price: 145000, provider_service_id: null },
      { name: '6 tháng', price: 290000, provider_service_id: null }
    ]
  },
  {
    cat: 'social',
    icon: 'fa-thumbs-up',
    slug: 'buff-like-facebook',
    name: 'Buff Like Facebook',
    desc: 'Tăng like bài viết Facebook theo số lượng, xử lý tự động sau khi thanh toán.',
    long_desc: 'Dịch vụ tăng like bài viết Facebook chất lượng, lên nhanh, không tụt. Xử lý tự động qua API ngay sau khi gửi yêu cầu.',
    image: '',
    rate: '4.8',
    price: '25.000đ ~ 220.000đ',
    variants: [
      { name: '1.000 like', price: 25000, provider_service_id: null },
      { name: '5.000 like', price: 110000, provider_service_id: null },
      { name: '10.000 like', price: 220000, provider_service_id: null }
    ]
  },
  {
    cat: 'social',
    icon: 'fa-user-plus',
    slug: 'buff-follow-tiktok',
    name: 'Buff Follow TikTok',
    desc: 'Tăng follow TikTok theo gói, phù hợp xây dựng kênh và tăng độ uy tín.',
    long_desc: 'Dịch vụ tăng lượt theo dõi kênh TikTok của bạn, thúc đẩy chỉ số kênh nhanh chóng và uy tín.',
    image: '',
    rate: '4.8',
    price: '35.000đ ~ 320.000đ',
    variants: [
      { name: '1.000 follow', price: 35000, provider_service_id: null },
      { name: '5.000 follow', price: 160000, provider_service_id: null },
      { name: '10.000 follow', price: 320000, provider_service_id: null }
    ]
  },
  {
    cat: 'social',
    icon: 'fa-eye',
    slug: 'buff-view-youtube',
    name: 'Buff View YouTube',
    desc: 'Tăng view YouTube theo số lượng, hỗ trợ video công khai và link hợp lệ.',
    long_desc: 'Dịch vụ tăng lượt xem video YouTube an toàn, uy tín. Phù hợp cho kênh mới bắt đầu cần kích hoạt kiếm tiền.',
    image: '',
    rate: '4.7',
    price: '20.000đ ~ 180.000đ',
    variants: [
      { name: '5.000 view', price: 20000, provider_service_id: null },
      { name: '25.000 view', price: 90000, provider_service_id: null },
      { name: '50.000 view', price: 180000, provider_service_id: null }
    ]
  },
  {
    cat: 'shopee',
    icon: 'fa-store',
    slug: 'buff-follow-shopee',
    name: 'Buff Follow Shopee',
    desc: 'Tăng follow gian hàng Shopee theo số lượng, phù hợp shop cần tăng độ uy tín.',
    long_desc: 'Tăng lượt theo dõi cho gian hàng Shopee của bạn để tăng điểm uy tín, thu hút khách mua hàng tự nhiên.',
    image: '',
    rate: '4.8',
    price: '30.000đ ~ 250.000đ',
    variants: [
      { name: '1.000 follow', price: 30000, provider_service_id: null },
      { name: '5.000 follow', price: 125000, provider_service_id: null },
      { name: '10.000 follow', price: 250000, provider_service_id: null }
    ]
  },
  {
    cat: 'shopee',
    icon: 'fa-bag-shopping',
    slug: 'buff-tim-shopee',
    name: 'Buff Tim Shopee',
    desc: 'Tăng lượt tim sản phẩm Shopee, hỗ trợ cải thiện tín hiệu tương tác cho gian hàng.',
    long_desc: 'Dịch vụ tăng yêu thích (tim) cho sản phẩm Shopee giúp cải thiện thứ hạng hiển thị tìm kiếm tự nhiên của sản phẩm đó.',
    image: '',
    rate: '4.7',
    price: '25.000đ ~ 220.000đ',
    variants: [
      { name: '1.000 tim', price: 25000, provider_service_id: null },
      { name: '5.000 tim', price: 110000, provider_service_id: null },
      { name: '10.000 tim', price: 220000, provider_service_id: null }
    ]
  },
  {
    cat: 'shopee',
    icon: 'fa-store',
    slug: 'shopee-mall-account',
    name: 'Tài khoản Shopee Mall',
    desc: 'Tài khoản Shopee cổ đăng ký lâu năm, được cấp đặc quyền Shopee Mall.',
    long_desc: 'Tài khoản Shopee Mall chất lượng cao, đăng ký từ 2020-2023, đã xác minh thông tin doanh nghiệp/cá nhân, sẵn sàng đăng bán và kích hoạt các nhãn Mall.',
    image: '',
    rate: '5.0',
    price: '50.000đ ~ 99.000đ',
    variants: [
      { name: 'Gói Cơ bản', price: 50000, provider_service_id: null },
      { name: 'Gói Cao cấp (Cổ)', price: 99000, provider_service_id: null }
    ]
  },
  {
    cat: 'shopee',
    icon: 'fa-shop',
    slug: 'shopee-seller-account',
    name: 'Tài khoản Shopee Seller',
    desc: 'Tài khoản Shopee tối ưu phục vụ bán hàng, lách luật đăng bài.',
    long_desc: 'Tài khoản Shopee Seller sẵn sàng bán hàng ngay, kháng tốt các đợt quét của Shopee. Hỗ trợ đăng sản phẩm nhanh chóng, bảo mật cao.',
    image: '',
    rate: '4.8',
    price: '80.000đ',
    variants: [
      { name: 'Acc Seller Standard', price: 80000, provider_service_id: null }
    ]
  },
  {
    cat: 'shopee',
    icon: 'fa-rectangle-ad',
    slug: 'shopee-ads-account',
    name: 'Tài khoản Shopee Ads',
    desc: 'Tài khoản Shopee cổ chạy quảng cáo không khóa, cắn tiền mượt.',
    long_desc: 'Tài khoản Shopee Ads có độ tin cậy cao, đã chạy thử chiến dịch ads mồi. Hỗ trợ nạp tiền quảng cáo nhanh, hạn chế bị khóa tài khoản quảng cáo.',
    image: '',
    rate: '4.9',
    price: '120.000đ',
    variants: [
      { name: 'Acc Ads Cổ', price: 120000, provider_service_id: null }
    ]
  },
  {
    cat: 'shopee',
    icon: 'fa-video',
    slug: 'shopee-live-account',
    name: 'Tài khoản Shopee Live',
    desc: 'Tài khoản mở sẵn tính năng livestream, tặng mã giảm giá độc quyền.',
    long_desc: 'Tài khoản Shopee Live có sẵn luồng livestream, được phân phối mã giảm giá và coupon độc quyền cho người xem live. Giúp bùng nổ doanh số bán hàng.',
    image: '',
    rate: '4.9',
    price: '70.000đ',
    variants: [
      { name: 'Acc Live Premium', price: 70000, provider_service_id: null }
    ]
  }
];

async function seed() {
  console.log('Seeding products into Supabase...');
  try {
    for (const prod of defaultProducts) {
      const { data, error } = await supabase.from('products').upsert(prod, { onConflict: 'slug' });
      if (error) {
        console.error(`❌ Error upserting product ${prod.slug}:`, error.message);
      } else {
        console.log(`✅ Upserted product: ${prod.slug}`);
      }
    }
    console.log('Done seeding products!');
  } catch (err) {
    console.error('Unexpected seed error:', err);
  }
}

seed();
