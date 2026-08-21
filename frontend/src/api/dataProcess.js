//frontend/src/api/dataProcess.js
import request from './index' // 引入你封裝好的 axios 攔截器

// 📊 撈取場站匯總清單 (給 DataEditList.vue 用的)
export const getStationsSummaryAPI = (month) => {
  return request.get('/data-process/stations', {
    params: { month: month }
  })
}

// 📋 撈取單一場站明細 (未來進入 V4.1 檢視畫面用的，我們先寫好)
export const getStationDetailAPI = (month, stationId) => {
  return request.get('/data-process/station-detail', {
    params: { month, stationId }
  })
}

// ✏️ 儲存修改的缺失 (主管修正誤判用的)
export const updateInspectionAPI = (id, payload) => {
  return request.put(`/data-process/inspections/${id}`, payload)
}

export const getFilterOptionsAPI = () => {
  return request.get('/data-process/filters')
}

// 🌟 新增：刪除該場站該月份的所有資料
export const deleteStationDataAPI = (month, stationId) => {
  return request.delete(`/data-process/stations/${month}/${stationId}`)
}

// 🌟 修正：撈取 Excel 模式的單車平鋪資料 (加入 page, limit 參數)
export const getFlatBikesAPI = (month, city, checker, page = 1, limit = 50) => {
  return request.get('/data-process/flat-bikes', {
    params: { month, city, checker, page, limit }
  })
}

// 🌟 新增：批次將當月份特定缺失歸零
//export const batchResetIssueAPI = (payload) => {
  // payload 會包含 { month, field, targetChecker }
 // return request.put('/data-process/batch-reset', payload)
//}

// 🌟 即時更新場站層級欄位
export const updateStationCellAPI = (payload) => {
  return request.put('/data-process/update-station-cell', payload)
}

// 🌟 即時更新單車層級欄位
export const updateBikeCellAPI = (payload) => {
  return request.put('/data-process/update-bike-cell', payload)
}

 //🌟 批次刪除勾選的場站
export const batchDeleteStationsAPI = (payload) => {
  return request.post('/data-process/batch-delete-stations', payload)
}

// 🌟 批次刪除勾選的單車紀錄
export const batchDeleteBikesAPI = (payload) => {
  return request.post('/data-process/batch-delete-bikes', payload)
}

// 新增這段：Excel 批次匯入更新
export const batchUpdateBikesAPI = (data) => {
  return request({
    url: '/data-process/batch-update-bikes',
    method: 'post',
    data // { updates: [ {id: 1, battery_no_display: 1}, ... ] }
  })
}