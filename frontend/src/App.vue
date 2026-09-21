<!-- src/App.vue -->
<template>
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

// ==========================================
// 🛡️ 系統閒置自動登出機制
// ==========================================
const IDLE_TIMEOUT_MINUTES = 30; // 👈 設定閒置幾分鐘後自動登出 (目前設 30 分鐘)
let timeoutId = null;

const handleLogout = () => {
  // 檢查是否處於登入狀態
  if (localStorage.getItem('user')) {
    localStorage.removeItem('user');
    ElMessage.warning(`您已閒置超過 ${IDLE_TIMEOUT_MINUTES} 分鐘，為保護系統安全已自動登出`);
    router.push('/login');
  }
}

const resetTimer = () => {
  // 每次使用者有動作，就清除舊的計時器
  if (timeoutId) clearTimeout(timeoutId);
  
  // 只有在已登入的狀態下，才重新開始倒數
  if (localStorage.getItem('user')) {
    timeoutId = setTimeout(handleLogout, IDLE_TIMEOUT_MINUTES * 60 * 1000);
  }
}

onMounted(() => {
  // 監聽使用者的各種操作行為：滑鼠移動、按鍵盤、點擊、滾輪、觸控
  const events = ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'];
  events.forEach(event => window.addEventListener(event, resetTimer));
  
  // 初始化計時器
  resetTimer();
})

onUnmounted(() => {
  // 元件銷毀時記得移除監聽器，避免記憶體流失
  const events = ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'];
  events.forEach(event => window.removeEventListener(event, resetTimer));
  if (timeoutId) clearTimeout(timeoutId);
})
</script>

<style>
/* 簡單清除一下瀏覽器預設的邊界 */
body {
  margin: 0;
  padding: 0;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
  'Microsoft YaHei', '微軟正黑', Arial, sans-serif;
}
</style>