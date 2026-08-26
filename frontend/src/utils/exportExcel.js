import * as XLSX from 'xlsx'
import { ElMessage, ElLoading } from 'element-plus'
import { getStationsSummaryAPI, getFlatBikesAPI } from '../api/dataProcess'
import { getScoringRulesAPI } from '../api/scoring' 

const formatTimeByRole = (val) => {
  if (!val) return '';
  const str = String(val);
  const userInfo = JSON.parse(localStorage.getItem('user') || '{}');
  const isHighLevelAdmin = userInfo.role_level && parseInt(userInfo.role_level) >= 90;
  return isHighLevelAdmin ? str.substring(0, 19) : str.substring(0, 10);
}

const toDateOnly = (val) => {
  if (!val) return '';
  return String(val).substring(0, 10); 
}

const hardcodedStationKeys = [
  'signpost_no_design', 'signpost_crooked', 'signpost_missing', 
  'station_clean_garbage', 'station_clean_leaves'
];

// 🌟 新增 status 參數
export const exportMonthDataToExcel = async (month, status) => {
  const loadingInstance = ElLoading.service({
    lock:       true,
    text:       `正在撈取 ${month} 的資料並產生 Excel，請稍候...`,
    background: 'rgba(0, 0, 0, 0.7)',
  })

  try {
    const [stationRes, bikeRes, rulesRes] = await Promise.all([
      getStationsSummaryAPI(month),
      getFlatBikesAPI(month, '', 'ALL', 1, 999999), 
      getScoringRulesAPI()
    ])

    const rawTableData = stationRes.data.success ? stationRes.data.data : []
    const rawBikeData  = bikeRes.data.success ? bikeRes.data.data : []
    const rules        = rulesRes.data.success ? rulesRes.data.data : []

    if (rawTableData.length === 0 && rawBikeData.length === 0) {
      ElMessage.warning(`[${month}] 目前沒有資料可以匯出喔！`)
      return false
    }

    const V = (val) => (val == 1 || val === true || val === '1') ? 'V' : ''

    const userInfo = JSON.parse(localStorage.getItem('user') || '{}');
    const isHighLevelAdmin = userInfo.role_level && parseInt(userInfo.role_level) >= 90;
    
    // 🌟 判斷這份報表是否已發布
    const isPublished = (status === 'published');

    // ==========================================
    // 🏠 1. Station 分頁 
    // ==========================================
    const stationExcelData = rawTableData.map(item => {
      let rowObj = {}
      if (isHighLevelAdmin) {
        rowObj['前台角色'] = item.front_role;
        rowObj['工號'] = item.checker;
      }
      rowObj['巡檢時間'] = formatTimeByRole(item.created_at);
      rowObj['縣市'] = item.city;
      rowObj['場站名稱'] = item.station_name;
      rowObj['場站車輛數'] = item.bikes_in_dock_count;
      rowObj['座椅反轉車輛數'] = item.reversed_saddle_count;
      rowObj['車機無法喚醒及暫停服務車輛數'] = item.inactive_bike_count;
      rowObj['場站導標桿'] = [
        V(item.signpost_no_design) ? '[無設計圖]' : '',
        V(item.signpost_crooked)   ? '[歪斜或毀損]' : '',
        V(item.signpost_missing)   ? '[缺漏]' : ''
      ].filter(Boolean).join(' ');
      rowObj['場站周圍整潔'] = [
        V(item.station_clean_garbage) ? '[人為廢棄物]' : '',
        V(item.station_clean_leaves)  ? '[落葉雜草或軟爛果實]' : ''
      ].filter(Boolean).join(' ');

      // 🌟 權限控管：只有發布後，才把備註加入 Excel 欄位
      if (isPublished) {
        rowObj['場站備註說明'] = item.station_note;
      }

      return rowObj;
    })

    // ==========================================
    // 🚲 2. Bike 分頁 
    // ==========================================
    const bikeRules = rules
      .filter(r => !hardcodedStationKeys.includes(r.item_key))
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));

    const bikeExcelData = rawBikeData.map(item => {
      let rowObj = {}
      if (isHighLevelAdmin) {
        rowObj['前台角色'] = item.front_role || '';
        rowObj['工號'] = item.checker || '';
      }
      rowObj['測驗日期'] = formatTimeByRole(item.formatted_created_at || item.created_at);
      rowObj['車種'] = item.model || '';
      rowObj['縣市'] = item.city || '';
      rowObj['場站名稱'] = item.station_name || '';
      rowObj['車號'] = item.bike_no || '';
      rowObj['照片數量'] = item.photo_count || 0;
      rowObj['照片連結'] = item.photo_url || '';
      rowObj['車柱柱號'] = item.dock_no || '';
      rowObj['可用電量'] = item.battery_level ?? item.battery_pct ?? '';
      rowObj['一級檢修日'] = toDateOnly(item.check_date);
      rowObj['一級檢修人員'] = item.first_level_checker ?? item.checker ?? '';

      bikeRules.forEach(rule => {
        const headerName = [rule.large_category || rule.major_category, rule.sub_category, rule.item_name].filter(Boolean).join('_');
        rowObj[headerName] = V(item[rule.item_key]);
      })

      rowObj['前胎壓'] = item.front_tire_psi !== null && item.front_tire_psi !== undefined ? item.front_tire_psi : '';
      rowObj['後胎壓'] = item.rear_tire_psi !== null && item.rear_tire_psi !== undefined ? item.rear_tire_psi : '';
      
      // 🌟 權限控管：只有發布後，才把這 4 個備註加入 Excel 欄位
      if (isPublished) {
        rowObj['其他備註']       = item.other_note || '';
        rowObj['車柱備註']       = item.dock_note || '';
        rowObj['外觀備註']       = item.appearance_note || '';
        rowObj['結構備註']       = item.structure_note || '';
      }

      rowObj['Id'] = item.id || '';

      return rowObj;
    })

    // ==========================================
    // 📦 SheetJS 匯出與雙層表頭處理 (此段維持不變)
    // ==========================================
    const wb = XLSX.utils.book_new()
    
    if (stationExcelData.length > 0) {
      const wsStation = XLSX.utils.json_to_sheet(stationExcelData)
      XLSX.utils.book_append_sheet(wb, wsStation, "Station")
    }
    
    if (bikeExcelData.length > 0) {
      const headers = Object.keys(bikeExcelData[0]);
      
      const headerToSeverity = {};
      bikeRules.forEach(rule => {
        const headerName = [rule.large_category || rule.major_category, rule.sub_category, rule.item_name].filter(Boolean).join('_');
        headerToSeverity[headerName] = rule.severity || '';
      });

      const gradeRow = headers.map(header => headerToSeverity[header] || '');
      const wsBike = XLSX.utils.aoa_to_sheet([gradeRow, headers]);

      XLSX.utils.sheet_add_json(wsBike, bikeExcelData, { skipHeader: true, origin: 'A3' });

      const range  = XLSX.utils.decode_range(wsBike['!ref']);
      let photoLinkColIdx  = -1, photoCountColIdx = -1, idColIdx = -1, dateColIdx = -1, bikeColIdx = -1;

      for (let c = range.s.c; c <= range.e.c; ++c) {
        const headerCell = wsBike[XLSX.utils.encode_cell({ r: 1, c })];
        if (headerCell) {
          if (headerCell.v === '照片連結') photoLinkColIdx  = c;
          if (headerCell.v === '照片數量') photoCountColIdx = c;
          if (headerCell.v === 'Id')       idColIdx         = c;
          if (headerCell.v === '測驗日期') dateColIdx       = c; 
          if (headerCell.v === '車號')     bikeColIdx       = c; 
        }
      }

      if (photoLinkColIdx !== -1) {
        for (let r = 2; r <= range.e.r; ++r) {
          const countCell   = wsBike[XLSX.utils.encode_cell({ r, c: photoCountColIdx })];
          const idCell      = wsBike[XLSX.utils.encode_cell({ r, c: idColIdx })];
          const linkCellRef = XLSX.utils.encode_cell({ r, c: photoLinkColIdx });
          
          const dateCell    = dateColIdx !== -1 ? wsBike[XLSX.utils.encode_cell({ r, c: dateColIdx })] : null;
          const bikeCell    = bikeColIdx !== -1 ? wsBike[XLSX.utils.encode_cell({ r, c: bikeColIdx })] : null;

          const photoCount = countCell ? parseInt(countCell.v) || 0 : 0;
          const recordId   = idCell ? idCell.v : null;

          if (photoCount > 0 && recordId) {
            const baseUrl = window.location.origin;
            const dateStr = dateCell && dateCell.v ? String(dateCell.v).substring(0, 10) : '未知日期';
            const bikeStr = bikeCell && bikeCell.v ? String(bikeCell.v) : '無車號';
            const viewerUrl = `${baseUrl}/photo-viewer?id=${recordId}&date=${dateStr}&bike=${bikeStr}`; 
            wsBike[linkCellRef] = { v: '查看照片', t: 's', l: { Target: viewerUrl } };
          } else {
            wsBike[linkCellRef] = { v: '', t: 's' };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, wsBike, "Bike")
    }

    XLSX.writeFile(wb, `YouBike模擬體驗_${month}.xlsx`)
    ElMessage.success(`${month} Excel 匯出成功！`)
    return true
  } catch (error) {
    console.error('匯出失敗:', error)
    ElMessage.error('匯出失敗，請稍後再試！')
    return false
  } finally {
    loadingInstance.close()
  }
}