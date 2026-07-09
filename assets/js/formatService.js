/**
 * FormatService - Universal JavaScript module for handling account data templates.
 * Compatible with both Node.js (CommonJS) and Browser globals.
 */
const FormatService = {
  /**
   * Parse a raw format string or JSON config into structured metadata.
   * Supports keys, labels, hidden fields, copy configuration.
   * 
   * @param {string} dataFormatStr 
   * @returns {Array<Object>}
   */
  parseDataFormat(dataFormatStr) {
    const defaultFormat = 'mail|pass';
    const str = (dataFormatStr || defaultFormat).trim();
    
    // 1. If it's a JSON array format (for future scalability)
    if (str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          return parsed.map(item => ({
            id: item.id || item.key || '',
            key: item.key || item.id || '',
            label: item.label || item.key || '',
            hidden: !!item.hidden,
            copy: item.copy !== false,
            multiline: !!item.multiline
          })).filter(item => item.key);
        }
      } catch (err) {
        console.error('Failed to parse JSON data_format:', err);
      }
    }
    
    // 2. Simple format string (e.g. mail|pass|cookie)
    const rawParts = str.split('|').map(p => p.trim()).filter(Boolean);
    return rawParts.map(part => {
      let key = part;
      let isHidden = false;
      
      // Starts with - means hidden
      if (key.startsWith('-')) {
        isHidden = true;
        key = key.substring(1).trim();
      }
      
      let label = '';
      const colonIdx = key.indexOf(':');
      if (colonIdx !== -1) {
        label = key.substring(colonIdx + 1).trim();
        key = key.substring(0, colonIdx).trim();
      } else {
        const defaultLabels = {
          mail: 'Email / Tài khoản',
          email: 'Email / Tài khoản',
          pass: 'Mật khẩu',
          password: 'Mật khẩu',
          uid: 'UID / ID',
          cookie: 'Cookie',
          token: 'Token',
          refresh_token: 'Refresh Token',
          client_id: 'Client ID',
          client_secret: 'Client Secret',
          phone: 'Số điện thoại',
          key: 'Key kích hoạt',
          proxy: 'Proxy',
          note: 'Ghi chú',
          backup_code: 'Mã Backup'
        };
        label = defaultLabels[key.toLowerCase()] || (key.charAt(0).toUpperCase() + key.slice(1));
      }
      
      return {
        id: key,
        key: key,
        label: label,
        hidden: isHidden,
        copy: true,
        multiline: false
      };
    });
  },

  /**
   * Parse a raw line text from a file/textarea into fields, extras and raw text.
   * 
   * @param {string} line 
   * @param {string} dataFormatStr 
   * @returns {Object}
   */
  parseAccountLine(line, dataFormatStr) {
    const fieldsMetadata = this.parseDataFormat(dataFormatStr);
    const lineParts = (line || '').split('|').map(p => p.trim());
    
    const fields = {};
    fieldsMetadata.forEach((meta, idx) => {
      fields[meta.key] = lineParts[idx] || '';
    });
    
    const extras = [];
    if (lineParts.length > fieldsMetadata.length) {
      for (let i = fieldsMetadata.length; i < lineParts.length; i++) {
        extras.push({
          position: i + 1,
          value: lineParts[i]
        });
      }
    }
    
    return {
      fields,
      extras,
      raw_text: line || ''
    };
  },

  /**
   * Validate a raw account line against format structure.
   * Returns validation status (success, warning_extra, warning_missing, error_invalid).
   * 
   * @param {string} line 
   * @param {string} dataFormatStr 
   * @returns {Object}
   */
  validateAccountLine(line, dataFormatStr) {
    const fieldsMetadata = this.parseDataFormat(dataFormatStr);
    const trimmedLine = (line || '').trim();
    
    if (!trimmedLine) {
      return {
        status: 'error_invalid',
        message: 'Dòng dữ liệu trống',
        missingFields: [],
        extraFields: []
      };
    }
    
    const lineParts = trimmedLine.split('|').map(p => p.trim());
    
    // Check if line looks completely raw and lacks separators when expected
    if (fieldsMetadata.length > 1 && lineParts.length === 1 && trimmedLine.length < 4) {
      return {
        status: 'error_invalid',
        message: 'Dòng không hợp lệ hoặc quá ngắn',
        missingFields: [],
        extraFields: []
      };
    }
    
    // Find missing fields
    const missingFields = [];
    fieldsMetadata.forEach((meta, idx) => {
      if (idx >= lineParts.length || !lineParts[idx]) {
        missingFields.push(meta.label || meta.key);
      }
    });
    
    if (missingFields.length > 0) {
      return {
        status: 'warning_missing',
        message: `Thiếu trường: ${missingFields.join(', ')}`,
        missingFields,
        extraFields: []
      };
    }
    
    // Find extra fields
    if (lineParts.length > fieldsMetadata.length) {
      const extraFields = [];
      for (let i = fieldsMetadata.length; i < lineParts.length; i++) {
        extraFields.push(`Trường #${i + 1} (${lineParts[i].substring(0, 15)}${lineParts[i].length > 15 ? '...' : ''})`);
      }
      return {
        status: 'warning_extra',
        message: `Thừa trường: ${extraFields.join(', ')}`,
        missingFields: [],
        extraFields
      };
    }
    
    return {
      status: 'success',
      message: 'Khớp hoàn toàn',
      missingFields: [],
      extraFields: []
    };
  },

  /**
   * Attempt to auto-detect a reasonable format string from a sample line.
   * 
   * @param {string} sampleLine 
   * @returns {string}
   */
  autoDetectFormat(sampleLine) {
    const trimmed = (sampleLine || '').trim();
    if (!trimmed) return 'mail|pass';
    
    const parts = trimmed.split('|').map(p => p.trim());
    const suggestions = [];
    
    parts.forEach((part, idx) => {
      if (part.includes('@')) {
        suggestions.push('mail');
      } else if (/^\d{8,18}$/.test(part)) {
        suggestions.push('uid');
      } else if (part.includes('=') || part.toLowerCase().startsWith('cookie') || part.length > 80) {
        suggestions.push('cookie');
      } else if (/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i.test(part) || (part.length > 40 && !part.includes(' '))) {
        suggestions.push('token');
      } else if (idx === 1 && suggestions.length > 0 && suggestions[0] !== 'pass') {
        suggestions.push('pass');
      } else {
        suggestions.push(`field${idx + 1}`);
      }
    });
    
    return suggestions.join('|');
  },

  parseDeliveryText(text) {
    if (!text) return null;
    
    text = text.trim();
    
    if (!text.includes('=== Tài khoản')) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const items = [];
      
      lines.forEach(line => {
        if (line.includes('|')) {
          const parts = line.split('|').map(p => p.trim());
          items.push({
            fields: {
              mail: parts[0],
              pass: parts[1]
            },
            extras: parts.slice(2).map((val, idx) => ({ position: idx + 3, value: val })),
            raw_text: line
          });
        } else {
          items.push({
            fields: {
              key: line
            },
            extras: [],
            raw_text: line
          });
        }
      });
      
      return {
        raw_data_format: 'mail|pass',
        parsed_format: [
          { key: 'mail', label: 'Email', hidden: false },
          { key: 'pass', label: 'Mật khẩu', hidden: false }
        ],
        items
      };
    }
    
    const parts = text.split(/=== Tài khoản #\d+ ===/i);
    const accountBlocks = parts.slice(1);
    const items = [];
    const parsedFormatMap = new Map();
    
    accountBlocks.forEach(block => {
      block = block.trim();
      if (!block) return;
      
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const fields = {};
      const extras = [];
      let rawText = '';
      
      let inExtras = false;
      let inRawText = false;
      
      lines.forEach(line => {
        if (line.toLowerCase().startsWith('📦 dữ liệu ngoài định dạng') || line.toLowerCase().startsWith('dữ liệu ngoài định dạng')) {
          inExtras = true;
          inRawText = false;
          return;
        }
        if (line.toLowerCase().startsWith('📄 dữ liệu gốc') || line.toLowerCase().startsWith('dữ liệu gốc')) {
          inExtras = false;
          inRawText = true;
          return;
        }
        
        if (inRawText) {
          rawText = line;
          return;
        }
        
        if (inExtras) {
          const match = line.match(/(?:Trường\s*#?|Field\s*#?)(\w+)\s*:\s*(.*)/i);
          if (match) {
            extras.push({
              position: match[1],
              value: match[2].trim()
            });
          } else {
            extras.push({
              position: 'Phụ',
              value: line
            });
          }
          return;
        }
        
        const parts = line.split(':');
        if (parts.length >= 2) {
          const labelWithEmoji = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          
          const cleanLabel = labelWithEmoji.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
          
          let key = cleanLabel.toLowerCase();
          if (key.includes('email') || key.includes('tài khoản') || key.includes('mail')) {
            key = 'mail';
          } else if (key.includes('mật khẩu') || key.includes('password') || key.includes('pass')) {
            key = 'pass';
          } else if (key.includes('refresh token') || key.includes('token')) {
            key = 'refresh_token';
          } else if (key.includes('client id')) {
            key = 'client_id';
          } else {
            key = key.replace(/[^a-z0-9]/g, '_');
          }
          
          if (!key) key = 'field_' + Math.random().toString(36).substring(2, 5);
          
          fields[key] = value === '(Trống)' ? '' : value;
          parsedFormatMap.set(key, { key, label: cleanLabel, hidden: false });
        }
      });
      
      items.push({
        fields,
        extras,
        raw_text: rawText
      });
    });
    
    const parsedFormat = Array.from(parsedFormatMap.values());
    items.forEach(item => {
      if (item.extras && item.extras.length > 0) {
        const remainingExtras = [];
        item.extras.forEach(ext => {
          const pos = parseInt(ext.position);
          if (!isNaN(pos) && pos > 0 && pos <= parsedFormat.length) {
            const fieldDef = parsedFormat[pos - 1];
            if (fieldDef) {
              const currentVal = item.fields[fieldDef.key];
              if (!currentVal || currentVal === '(Trống)' || currentVal.trim() === '') {
                item.fields[fieldDef.key] = ext.value;
                return; // Merged
              }
            }
          }
          remainingExtras.push(ext);
        });
        item.extras = remainingExtras;
      }
    });

    return {
      raw_data_format: Array.from(parsedFormatMap.keys()).join('|'),
      parsed_format: parsedFormat,
      items
    };
  }
};

// Export structure
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormatService;
} else {
  window.FormatService = FormatService;
}
