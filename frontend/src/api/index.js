//frontend/src/api/index.js
import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router' // 引入路由，為了 401 時可以踢回登入頁

const apiBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

// 1. 建立獨立的 axios 實例
const request = axios.create({
  // baseURL 會自動加在每支 API 網址前面
  // 請確認你的 vite.config.js 代理設定是不是走 '/api'
  baseURL: apiBaseURL,
  timeout: 60000 // 逾時時間設定 10 秒
})

// 2. 🚀 請求攔截器 (Request Interceptor) - 發送 API 之前的「海關」
request.interceptors.request.use(
  (config) => {
    // 從 localStorage 拿出你登入時存的 user 資訊
    const userString = localStorage.getItem('user')
    if (userString) {
      const user = JSON.parse(userString)
      // 如果你的 token 是存在 user 物件裡面 (例如 user.token)，把它拿出來塞進 Header
      if (user && user.token) {
        config.headers['Authorization'] = `Bearer ${user.token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 3. 🛡️ 回應攔截器 (Response Interceptor) - 收到後端資料後的「品管」
request.interceptors.response.use(
  (response) => {
    // HTTP 狀態碼 200 成功，直接把資料放行
    return response
  },
  (error) => {
    // 統一攔截各種 HTTP 錯誤碼
    if (error.response) {
      switch (error.response.status) {
        case 401: // Unauthorized (Token 過期或未帶 Token)
          localStorage.removeItem('user') // 清除失效的帳號狀態
          router.push('/login') // 強制踢回登入頁面
          break
        case 403: // Forbidden (沒權限)
          break
        case 500: // Internal Server Error (後端當機)
          break
        default:
          // 其他錯誤，顯示後端回傳的錯誤訊息
          ElMessage.error(error.response.data?.message || '發生未知錯誤')
      }
    } else {
      ElMessage.error('網路連線失敗，請檢查網路狀態')
    }
    return Promise.reject(error)
  }
)

export default request