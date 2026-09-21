//frontend/src/api/report.js
import request from './index'

// 1. 撈取月度總分看板資料
export const getReportSummaryAPI = (month, user_id, role_level) => {
  return request({
    url: '/report/summary',
    method: 'get',
    params: { month, user_id, role_level }
  })
}

// 2. 手動觸發重新結算 API
export const recalculateReportAPI = (month) => {
  return request.post('/report/recalculate', { month })
}

// 3. 撈取月份 API
export const getReportMonthsAPI = (roleLevel) => {
  return request.get('/report/months', {
    params: { role_level: roleLevel }
  })
}

// 4. 撈取單一縣市 A/B/C 級缺失統計表
export const getCityIssuesAPI = (month, city, user_id) => {
  return request({
    url: '/report/city-issues',
    method: 'get',
    params: { month, city, user_id }
  })
}

// 5. 撈取縣市(大區)選單 API
export const getReportCitiesAPI = (userId, roleLevel) => {
  return request.get('/report/cities', {
    params: { user_id: userId, role_level: roleLevel }
  })
}

// 6. 儲存一級維護率手動輸入資料
export const updateMaintenanceDataAPI = (month, city, field, value) => {
  return request.put('/report/maintenance', { month, city, field, value })
}

