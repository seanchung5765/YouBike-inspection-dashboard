<template>
  <div class="login-wrapper">
    <div class="login-card">
      
      <!-- 🌟 頂部 Logo 與標題 (改為置中排版與插畫) -->
      <div class="card-header">
        <img src="/bike.png" alt="Logo" class="login-logo" />
        <h1 class="card-title">系統登入</h1>
        <p class="card-subtitle">請使用公司帳號登入</p>
      </div>

      <!-- 表單區域 -->
      <el-form 
        :model="loginForm" 
        :rules="rules" 
        ref="loginFormRef"
        label-position="top"
        class="login-form"
      >
        <el-form-item label="帳號" prop="username">
          <el-input 
            v-model="loginForm.username" 
            placeholder="" 
            class="custom-input"
          />
        </el-form-item>

        <el-form-item label="密碼" prop="password">
          <el-input 
            v-model="loginForm.password" 
            type="password" 
            placeholder="" 
            show-password
            class="custom-input"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <!-- 🌟 新增：記住我 與 忘記密碼 -->
        <div class="form-options">
          <el-checkbox v-model="rememberMe">記住我</el-checkbox>
          <el-link type="primary" :underline="false" @click="handleForgotPassword">忘記密碼？</el-link>
        </div>

        <el-form-item class="submit-item">
          <el-button 
            type="primary" 
            class="submit-btn" 
            :loading="loading" 
            @click="handleLogin"
          >
            登入
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 🌟 新增：底部版權宣告 -->
      <div class="card-footer">
        © 2026 YouBike Co., Ltd
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { loginAPI } from '../api/auth'

const router = useRouter()
const loginFormRef = ref(null)
const loading = ref(false)

// 🌟 新增：記住我 的狀態
const rememberMe = ref(true)

// 1. 表單資料
const loginForm = reactive({
  username: '',
  password: ''
})

// 2. 表單驗證規則
const rules = {
  username: [{ required: true, message: '請輸入工號', trigger: 'blur' }],
  password: [{ required: true, message: '請輸入密碼', trigger: 'blur' }]
}

// 讀取「記住我」的帳號
onMounted(() => {
  const savedUsername = localStorage.getItem('remembered_username')
  if (savedUsername) {
    loginForm.username = savedUsername
    rememberMe.value = true
  }
})

// 忘記密碼的提示邏輯
const handleForgotPassword = () => {
  ElMessage.info('請聯繫系統管理員 (IT 部門) 協助重置密碼。')
}

// 3. 登入邏輯
const handleLogin = async () => {
  if (!loginFormRef.value) return 
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const response = await loginAPI({
          username: loginForm.username,
          password: loginForm.password
        })

        if (response.data.success) {
          const user = response.data.user;
          
          // 🌟 前端防護網：如果該帳號沒有綁定任何「後台權限」或「角色」，拒絕登入
          // (假設無角色的 back_role_id 是 null 或 3，你可以依照你的資料庫定義調整)
          if (!user || !user.back_role_id || !user.role_level) {
             ElMessage.error('您尚未開通後台系統權限，請聯絡系統管理員。');
             // 強制登出 / 清除可能的殘留 Token
             localStorage.removeItem('token'); 
             return; 
          }

          ElMessage.success('登入成功！')
          
          // 將使用者資訊轉成字串存進瀏覽器
          localStorage.setItem('user', JSON.stringify(user))
          
          // 處理「記住我」邏輯
          if (rememberMe.value) {
            localStorage.setItem('remembered_username', loginForm.username)
          } else {
            localStorage.removeItem('remembered_username')
          }
          
          router.push('/dashboard')
        }
      } catch (error) {
        console.error('登入錯誤:', error)
        // 🌟 接收後端傳來的「無權限」錯誤訊息
        const errMsg = error.response?.data?.message || '登入失敗，請檢查帳號密碼或網路連線'
        ElMessage.error(errMsg)
      } finally {
        loading.value = false
      }
    }
  })
}
</script>

<style scoped>
/* 頁面背景：淡淡的灰底色，讓白色卡片跳出來 */
.login-wrapper {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f5f7fa; 
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 卡片主體：還原截圖中的白底與細緻陰影 */
.login-card {
  width: 380px;            
  background: #ffffff;
  border-radius: 8px;      /* 縮小圓角，更貼近原圖的俐落感 */
  padding: 40px;      
  box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.08); /* 乾淨清爽的陰影 */
}

/* 頂部區域：置中排版 */
.card-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;    
}

/* 插畫 Logo */
.login-logo {
  height: 60px; /* 根據你的圖片比例可微調 */
  object-fit: contain;
  margin-bottom: 15px;
}

.card-title {
  font-size: 26px;
  color: #333333;
  margin: 0 0 8px 0;
  font-weight: bold;
  letter-spacing: 1px;
}

.card-subtitle {
  font-size: 14px;
  color: #606266; /* 原圖中淡淡的提示字顏色 */
  margin: 0;
}

/* 表單與標籤 */
.login-form :deep(.el-form-item) {
  margin-bottom: 20px; 
}

.login-form :deep(.el-form-item__label) {
  color: #333333;        
  font-size: 14px;
  font-weight: bold;
  padding-bottom: 6px !important; 
  line-height: 1;
}

/* 輸入框外觀：還原圓角細邊框 */
.custom-input :deep(.el-input__wrapper) {
  background-color: #ffffff;
  border: 1px solid #dcdfe6; 
  box-shadow: none !important; 
  border-radius: 6px;
  padding: 0 12px; 
  height: 42px; /* 高度縮減，看起來更精緻 */
  transition: all 0.2s ease;
}

.custom-input :deep(.el-input__wrapper.is-focus) {
  border-color: #409EFF; /* Focus 時變成藍色邊框 */
}

.custom-input :deep(.el-input__inner) {
  color: #333333;
  font-size: 15px;
}

/* 記住我 與 忘記密碼 的橫列 */
.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

/* 記住我 Checkbox 樣式 */
:deep(.el-checkbox__label) {
  color: #333333 !important;
  font-weight: normal;
}

/* 按鈕區域 */
.submit-item {
  margin-bottom: 0 !important;
}

/* 登入按鈕：明亮的 YouBike 藍色 */
.submit-btn {
  width: 100%;
  height: 44px;
  background-color: #0066ff !important; /* 根據原圖調整為飽和的藍色 */
  border-color: #0066ff !important;
  border-radius: 6px;
  font-size: 16px;
  font-weight: normal;
  letter-spacing: 2px; 
}

.submit-btn:hover {
  background-color: #3385ff !important; 
  border-color: #3385ff !important;
}

/* 底部版權文字 */
.card-footer {
  margin-top: 40px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}
</style>