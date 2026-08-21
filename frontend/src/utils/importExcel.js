import * as XLSX from 'xlsx'

// 🌟 無敵標準化工具：新增支援大於、小於、波浪號的全半形過濾
const normalize = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/[\/／]/g, '/')   // 統一斜線
    .replace(/[\(（]/g, '(')   // 統一左括號
    .replace(/[\)）]/g, ')')   // 統一右括號
    .replace(/[＜]/g, '<')      // 統一小於號
    .replace(/[＞]/g, '>')      // 統一大於號
    .replace(/[～]/g, '~')      // 統一波浪號
    .replace(/[－—]/g, '-')    // 統一減號
    .replace(/\s+/g, '');      // 移除所有空白
};

const findKey = (row, target) => {
  const normTarget = normalize(target);
  const actualKey  = Object.keys(row).find(k => normalize(k) === normTarget);
  return actualKey ? row[actualKey] : undefined;
};

const hardcodedStationKeys = [
  'signpost_no_design', 'signpost_crooked', 'signpost_missing', 
  'station_clean_garbage', 'station_clean_leaves'
];

export const parseBikeExcel = (fileRaw, rules) => {
  return new Promise((resolve, reject) => {
    if (!rules || !Array.isArray(rules)) {
      return reject(new Error('無法取得計分規則字典，請重整頁面後再試。'));
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const result   = { bikeUpdates: [], stationUpdates: [] }

        // ==========================================
        // 🏠 1. 解析 Station 分頁
        // ==========================================
        const stationSheetName = workbook.SheetNames.find(n => n.toLowerCase().replace(/\s+/g, '').includes('station'))
        if (stationSheetName) {
          const stationJson = XLSX.utils.sheet_to_json(workbook.Sheets[stationSheetName], { raw: false })
          
          result.stationUpdates = stationJson.map(row => {
            const signpostStr = String(findKey(row, '場站導標桿') || '')
            const cleanStr    = String(findKey(row, '場站周圍整潔') || '')

            let stationObj = {
              created_by:            String(findKey(row, '工號') || '').trim(),
              city:                  String(findKey(row, '縣市') || '').trim(),
              station_name:          String(findKey(row, '場站名稱') || '').trim(),
              
              bikes_in_dock_count:   parseInt(findKey(row, '場站車輛數'), 10) || 0,
              reversed_saddle_count: parseInt(findKey(row, '座椅反轉車輛數'), 10) || 0,
              inactive_bike_count:   parseInt(findKey(row, '車機無法喚醒及暫停服務車輛數'), 10) || 0,
              
              signpost_no_design:    signpostStr.includes('[無設計圖]') ? 1 : 0,
              signpost_crooked:      signpostStr.includes('[歪斜或毀損]') ? 1 : 0,
              signpost_missing:      signpostStr.includes('[缺漏]') ? 1 : 0,
              station_clean_garbage: cleanStr.includes('[人為廢棄物]') ? 1 : 0,
              station_clean_leaves:  cleanStr.includes('[落葉雜草或軟爛果實]') ? 1 : 0,
              
              station_note:          String(findKey(row, '場站備註說明') || '').trim(),
              created_at:            String(findKey(row, '巡檢時間') || '').trim() || null, 
            }

            return stationObj;
          }).filter(s => s.station_name) 
        }

        // ==========================================
        // 🚲 2. 解析 Bike 分頁 (支援智慧尋找表頭)
        // ==========================================
        let bikeSheetName = workbook.SheetNames.find(n => n.toLowerCase().replace(/\s+/g, '').includes('bike'))
        if (!bikeSheetName) {
          if (workbook.SheetNames.length === 1) {
            bikeSheetName = workbook.SheetNames[0]
          } else {
            bikeSheetName = workbook.SheetNames.find(n => n !== stationSheetName) || workbook.SheetNames[0]
          }
        }
        
        const bikeSheet = workbook.Sheets[bikeSheetName];

        const aoa = XLSX.utils.sheet_to_json(bikeSheet, { header: 1, raw: false });
        let headerRowIndex = 0;
        
        for (let i = 0; i < Math.min(5, aoa.length); i++) {
          const rowStr = (aoa[i] || []).map(cell => normalize(String(cell))).join('');
          if (rowStr.includes('車號') || rowStr.includes('測驗日期') || rowStr.includes('前台角色')) {
            headerRowIndex = i;
            break;
          }
        }

        const bikeJson = XLSX.utils.sheet_to_json(bikeSheet, { range: headerRowIndex, raw: false });
        
        const bikeRules = rules.filter(r => !hardcodedStationKeys.includes(r.item_key));

        result.bikeUpdates = bikeJson.map(row => {
          const rowKeys = Object.keys(row)
          
          let bikeObj = {
            id:                  row.Id || row.id || row.ID || findKey(row, 'Id'),
            front_role:          String(findKey(row, '前台角色') || '').trim(),
            created_by:          String(findKey(row, '工號') || '').trim(),
            created_at:          String(findKey(row, '測驗日期') || '').trim() || null, 
            model:               String(findKey(row, '車種') || '').trim(),
            city:                String(findKey(row, '縣市') || '').trim(),
            station_name:        String(findKey(row, '場站名稱') || '').trim(),
            bike_no:             String(findKey(row, '車號') || '').trim(),
            dock_no:             String(findKey(row, '車柱柱號') || '').trim(),
            first_level_checker: String(findKey(row, '一級檢修人員') || '').trim(),
            check_date:          String(findKey(row, '一級檢修日') || '').trim() || null  
          }

          bikeRules.forEach(rule => {
            const targetHeader = [rule.large_category || rule.major_category, rule.sub_category, rule.item_name].filter(Boolean).join('_')
            const normTarget   = normalize(targetHeader)
            const actualExcelKey = rowKeys.find(k => normalize(k) === normTarget)
            
            if (actualExcelKey !== undefined) {
              const excelValue = String(row[actualExcelKey]).trim().toUpperCase()
              bikeObj[rule.item_key] = (excelValue === 'V' || excelValue === '1') ? 1 : 0
            } else {
              bikeObj[rule.item_key] = 0
            }
          })

          // 🌟 修正：空值應該是 null，絕對不能是 0 (0 會被系統判定為嚴重沒氣！)
          const fStr = findKey(row, '前胎壓') || findKey(row, '其他測試_前胎壓');
          const rStr = findKey(row, '後胎壓') || findKey(row, '其他測試_後胎壓');
          bikeObj.front_tire_psi = (fStr !== undefined && String(fStr).trim() !== '') ? parseFloat(fStr) : null;
          bikeObj.rear_tire_psi  = (rStr !== undefined && String(rStr).trim() !== '') ? parseFloat(rStr) : null;

          // 🌟 智慧雙重防護：如果 Excel 漏打勾或符號對不上，我們用真實的胎壓數字自動幫它補上異常！
          const f = bikeObj.front_tire_psi;
          const r = bikeObj.rear_tire_psi;

          if (f !== null || r !== null) {
            const isLow = (val) => val !== null && val < 50;
            const isHigh = (val) => val !== null && val > 90;
            const isSlightlyHigh = (val) => val !== null && val >= 76 && val <= 90;

            if (isLow(f) || isLow(r)) bikeObj.tire_pressure_too_low = 1;
            if (isHigh(f) || isHigh(r)) bikeObj.tire_pressure_too_high = 1;
            if (isSlightlyHigh(f) || isSlightlyHigh(r)) bikeObj.tire_pressure_slightly_high = 1;
          }

          bikeObj.dock_note        = String(findKey(row, '車柱備註') || findKey(row, '車柱備註(文字)') || '').trim()
          bikeObj.appearance_note  = String(findKey(row, '車體外觀與附屬裝備備註') || findKey(row, '外觀備註(文字)') || '').trim()
          bikeObj.structure_note   = String(findKey(row, '車體結構與安全功能備註') || findKey(row, '車體結構與安全功能備註(文字)') || '').trim()
          bikeObj.other_note       = String(findKey(row, '其他測試_備註') || findKey(row, '其他測試備註(文字)') || '').trim()
          bikeObj.battery_level    = parseFloat(findKey(row, '可用電量') || findKey(row, '2.0借出可用電量(%)')) || null

          return bikeObj
        }).filter(u => u.id) 

        resolve(result)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = (error) => reject(error)
    reader.readAsArrayBuffer(fileRaw)
  })
}