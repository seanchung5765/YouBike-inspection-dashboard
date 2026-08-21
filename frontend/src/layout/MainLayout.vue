<template>
  <el-container class="layout-container">
    
    <!-- 💻 電腦版 & 手機版共用頂部 Header -->
    <el-header class="top-header">
      <!-- 左側 Logo 與手機版漢堡按鈕 -->
      <div class="header-left">
        
        
        <!-- 🌟 換成你的插畫 Logo 與簡約文字 -->
        <img src="/bike.png" alt="Logo" class="sys-logo" />
        <div class="logo-text">YouBike 模擬體驗</div>
      </div>

      <!-- 中間：電腦版水平下拉選單 (🌟 改為白底亮色系) -->
      <div class="header-menu hidden-xs-only">
        <el-menu 
          :default-active="$route.name" 
          class="horizontal-menu" 
          mode="horizontal"
          background-color="#ffffff" 
          text-color="#606266" 
          active-text-color="#409EFF"
          :ellipsis="true"
        >
          <el-menu-item index="Dashboard" @click="router.push({ name: 'Dashboard' })">
            <el-icon><DataLine /></el-icon><span>系統首頁</span>
          </el-menu-item>
          
          <template v-for="menu in menuList" :key="menu.id">
            <el-sub-menu v-if="menu.children && menu.children.length > 0" :index="String(menu.id)">
              <template #title>
                <el-icon><component :is="menu.icon_code || 'Menu'" /></el-icon><span>{{ menu.name }}</span>
              </template>
              <el-menu-item v-for="child in menu.children" :key="child.id" :index="child.route_code" @click="handleMenuClick(child)">
                {{ child.name }}
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="menu.route_code" @click="handleMenuClick(menu)">
              <el-icon><component :is="menu.icon_code || 'Document'" /></el-icon><span>{{ menu.name }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </div>

      <!-- 右側：字體放大器與登出資訊 -->
      <div class="header-right">
        <!-- 電腦版字體縮放拉桿 -->
        <div class="font-zoom-ctrl hidden-xs-only">
          <span class="zoom-label">字體 {{ Math.round(fontZoom * 100) }}%</span>
          <el-slider v-model="fontZoom" :min="0.8" :max="1.5" :step="0.1" @input="handleFontZoomChange" :show-tooltip="false" class="zoom-slider" />
        </div>

        <!-- 🌟 簡化為截圖中的樣式：登出 ( 姓名 ) -->
        <span class="user-logout" @click="handleCommand('logout')">
          登出 ( {{ userName }} )
        </span>
      </div>
    </el-header>

    <!-- 📱 手機版折疊選單 (🌟 同步改為白底亮色系) -->
    <el-drawer v-model="drawerVisible" direction="ltr" size="240px" :with-header="false" class="mobile-drawer">
      <div style="display: flex; flex-direction: column; height: 100%; background-color: #ffffff;">
        <div style="height: 80px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #ebeef5; flex-direction: column;">
           <img src="/bike.png" alt="Logo" style="height: 40px; margin-bottom: 5px;" />
           <span style="font-weight: bold; color: #333; font-size: 14px;">YouBike 模擬體驗</span>
        </div>
        
        <div style="flex: 1; overflow-y: auto;">
          <el-menu active-text-color="#409EFF" background-color="#ffffff" text-color="#606266" :default-active="$route.name" style="border-right: none;">
            <el-menu-item index="Dashboard" @click="router.push({ name: 'Dashboard' }); drawerVisible = false;">
              <el-icon><DataLine /></el-icon><span>系統首頁</span>
            </el-menu-item>
            <template v-for="menu in menuList" :key="menu.id">
              <el-sub-menu v-if="menu.children && menu.children.length > 0" :index="String(menu.id)">
                <template #title>
                  <el-icon><component :is="menu.icon_code || 'Menu'" /></el-icon><span>{{ menu.name }}</span>
                </template>
                <el-menu-item v-for="child in menu.children" :key="child.id" :index="child.route_code" @click="handleMenuClick(child); drawerVisible = false;">
                  {{ child.name }}
                </el-menu-item>
              </el-sub-menu>
              <el-menu-item v-else :index="menu.route_code" @click="handleMenuClick(menu); drawerVisible = false;">
                <el-icon><component :is="menu.icon_code || 'Document'" /></el-icon><span>{{ menu.name }}</span>
              </el-menu-item>
            </template>
          </el-menu>
        </div>

        <!-- 手機版字體縮放拉桿 -->
        <div class="sidebar-footer">
          <div style="font-size: 13px; color: #606266; margin-bottom: 5px; display: flex; justify-content: space-between;">
            <span>字體放大比例</span>
            <span>{{ Math.round(fontZoom * 100) }}%</span>
          </div>
          <el-slider v-model="fontZoom" :min="0.8" :max="1.5" :step="0.1" @input="handleFontZoomChange" :show-tooltip="false" />
        </div>
      </div>
    </el-drawer>

    <!-- 下方內容區塊 -->
    <el-main class="main-content">
      <router-view />
    </el-main>

  </el-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMenusAPI } from '../api/menus'

const router = useRouter()
const route = useRoute() 
const userName = ref('使用者')
const menuList = ref([]) 
const drawerVisible = ref(false)

// 字體縮放狀態
const fontZoom = ref(1)

const applyFontZoom = (scale) => {
  const root = document.documentElement
  root.style.setProperty('--el-font-size-extra-small', `${12 * scale}px`)
  root.style.setProperty('--el-font-size-small', `${13 * scale}px`)
  root.style.setProperty('--el-font-size-base', `${14 * scale}px`) 
  root.style.setProperty('--el-font-size-medium', `${16 * scale}px`)
  root.style.setProperty('--el-font-size-large', `${18 * scale}px`)
  root.style.setProperty('--el-font-size-extra-large', `${20* scale}px`)
  document.body.style.fontSize = `${14 * scale}px`
}

const handleFontZoomChange = (val) => {
  applyFontZoom(val)
  localStorage.setItem('fontZoom', val)
}

const handleMenuClick = (item) => {
  if (item.route_code) router.push({ name: item.route_code })
}

const buildTree = (data) => {
  const tree = []
  const lookup = {}
  data.forEach(item => {
    const idStr = String(item.id)
    lookup[idStr] = { ...item, children: [] }
  })
  data.forEach(item => {
    const idStr = String(item.id)
    if (item.parent_id === null || item.parent_id === undefined) {
      tree.push(lookup[idStr])
    } else {
      const parentIdStr = String(item.parent_id)
      if (lookup[parentIdStr]) lookup[parentIdStr].children.push(lookup[idStr])
      else tree.push(lookup[idStr])
    }
  })
  return tree
}

onMounted(async () => {
  const savedZoom = localStorage.getItem('fontZoom')
  if (savedZoom) {
    fontZoom.value = parseFloat(savedZoom)
    applyFontZoom(fontZoom.value)
  } else {
    applyFontZoom(1)
  }

  const userString = localStorage.getItem('user')
  if (!userString) {
    ElMessage.error('尚未登入，請先登入')
    router.push('/login')
    return
  }

  const user = JSON.parse(userString)
  userName.value = user.name || user.emp_id

  try {
    const res = await getMenusAPI(user.role)
    if (res.data.success) {
      menuList.value = buildTree(res.data.data)
    }
  } catch (error) {
    ElMessage.error('抓取選單失敗，請聯絡系統管理員')
  }
})

const handleCommand = (command) => {
  if (command === 'logout') {
    localStorage.removeItem('user') 
    applyFontZoom(1) 
    ElMessage.success('已登出系統')
    router.push('/login') 
  }
}
</script>

<style scoped>
.layout-container { 
  height: 100vh; 
  display: flex;
  flex-direction: column;
}

/* 🌟 改版：純白背景 + 底部微陰影/邊框 */
.top-header { 
  background-color: #ffffff; 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 0 20px;
  height: 60px;
  border-bottom: 1px solid #ebeef5;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.header-left {
  display: flex;
  align-items: center;
}

/* 🌟 Logo 圖片樣式 */
.sys-logo {
  height: 40px; 
  margin-right: 12px;
  object-fit: contain;
}

/* 🌟 旁邊的文字樣式 */
.logo-text { 
  font-size: 16px; 
  color: #606266; 
  white-space: nowrap;
}

.header-menu {
  flex: 1;
  padding: 0 40px;
}
.horizontal-menu {
  border-bottom: none !important;
  height: 60px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

/* 🌟 登出按鈕：還原截圖的純文字質感 */
.user-logout { 
  cursor: pointer; 
  display: flex; 
  align-items: center; 
  color: #333;
  font-size: 14px;
  transition: color 0.3s;
}
.user-logout:hover {
  color: #409EFF;
}

.font-zoom-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 180px;
}
.zoom-label {
  color: #909399;
  font-size: 13px;
  white-space: nowrap;
}
.zoom-slider {
  flex: 1;
}

/* 讓 Slider 融入淺色背景 */
:deep(.el-slider__runway) { background-color: #ebeef5; }
:deep(.el-slider__bar) { background-color: #409EFF; }
:deep(.el-slider__button) { border-color: #409EFF; }

.main-content { 
  background-color: #f0f2f5; 
  padding: 20px; 
  flex: 1;
  overflow-y: auto;
}

/* 手機版抽屜的底部設定區 */
.sidebar-footer {
  padding: 15px 20px;
  border-top: 1px solid #ebeef5;
  background-color: #fafafa;
}

@media (max-width: 768px) {
  .hidden-xs-only { display: none !important; }
  .top-header { padding: 0 15px; }
  .main-content { padding: 10px; } 
}
</style>