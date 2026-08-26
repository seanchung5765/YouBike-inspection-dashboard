//frontend/src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus' // 🌟 記得引入 ElMessage 來跳通知
import Login from '../views/Login.vue' 
import MainLayout from '../layout/MainLayout.vue' 

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/photo-viewer',
    name: 'PhotoViewer',
    component: () => import('../views/PhotoViewer.vue'), 
    meta: { requiresAuth: true } 
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard', 
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'), 
      },
      // 📂 1. 權限管理 (只限高階主管 role_level >= 90)
      {
        path: 'admin',
        meta: { requiredRoleLevel: 90 }, // 🌟 整個 admin 資料夾都被鎖起來
        children: [
          {
            path: 'unit-management',
            name: 'unit-management',
            component: () => import('../views/admin/UnitManagement.vue'), 
          },
          {
            path: 'user-management',
            name: 'user-management',
            component: () => import('../views/admin/UserManagement.vue'), 
          },
          {
            path: 'view-auth',
            name: 'view-auth',
            component: () => import('../views/admin/ViewAuthView.vue'), 
          }
        ]
      },
      // 📂 2. 資料管理 (限制中階以上主管 role_level >= 50，依你實際需求調整數字)
      {
        path: 'data',
        meta: { requiredRoleLevel: 50 }, // 🌟 資料管理需要中階主管權限
        children: [
          {
            path: 'monthly-sync',
            name: 'monthly-sync',
            component: () => import('../views/dataprocess/SyncManager.vue'), 
          },
          {
            path: 'data-edit',      
            name: 'data-edit',
            component: () => import('../views/dataprocess/DataEditList.vue'), 
          },
        ]
      },
      // 📂 3. 系統設定 (只限高階主管 role_level >= 90 才能修改規則)
      {
        path: 'system',
        meta: { requiredRoleLevel: 90 }, // 🌟 系統設定嚴格上鎖
        children: [
          {
            path: 'scoring-rules',      
            name: 'scoring-rules',
            component: () => import('../views/system/ScoringRules.vue'), 
          }
        ]
      },
      // 📂 4. 報表統計 (大家都能看，不加權限標籤) 
      {
        path: 'report',
        children: [
          {
            path: 'total-score',      
            name: 'total-score',
            component: () => import('../views/report/SummaryDashboard.vue'), 
          }
        ]
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// ============================================================================
// 🛡️ 全局導航守衛 (Navigation Guard) - 防止越權與網址偷渡
// ============================================================================
router.beforeEach((to, from, next) => {
  // 1. 取得存在瀏覽器裡的登入者資訊
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const userRoleLevel = user && user.role_level ? parseInt(user.role_level) : 0;

  // 2. 如果使用者沒登入，且想去的頁面不是登入頁，就踢回登入頁
  if (!user && to.path !== '/login') {
    return next({ path: '/login' });
  }

  // 3. 檢查即將前往的頁面，是否有設定最低權限要求 (requiredRoleLevel)
  // to.matched 會檢查該路由的所有父層與子層 meta
  const requiredLevelRecord = to.matched.find(record => record.meta.requiredRoleLevel !== undefined);
  
  if (requiredLevelRecord) {
    const requiredLevel = requiredLevelRecord.meta.requiredRoleLevel;

    // 4. 如果使用者的權限等級「小於」頁面要求的等級，就攔截！
    if (userRoleLevel < requiredLevel) {
      ElMessage.error('權限不足！您無法訪問此頁面。');
      return next({ path: '/dashboard' }); // 踢回首頁 Dashboard
    }
  }

  // 5. 權限沒問題，放行！
  next();
})

export default router