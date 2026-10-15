<template>
  <div id="tour-view-auth-container" class="view-auth-container">
    <el-card>
      <template #header>
        <div class="header-container">
          <span>閱覽權限管理</span>
          <el-button type="primary" icon="Plus" @click="handleAdd" class="mobile-full-btn">新增閱覽權限</el-button>
        </div>
      </template>

      <div class="search-bar" style="margin-bottom: 20px;">
        <el-input
          v-model="searchQuery"
          placeholder="請輸入工號或姓名"
          class="mobile-search-input"
          clearable
        />
        <el-button type="primary" @click="fetchViewers" class="mobile-full-btn search-btn">查詢</el-button>
      </div>

      <!-- 🌟 神奇透明圖層區：用來覆蓋表格直行，創造長條形高亮 -->
      <div class="table-overlay-container">
        <!-- 依比例對齊各個欄位 (移除了前台角色) -->
        <div id="tour-col-unit" class="overlay-col-unit"></div>
        <div id="tour-col-region" class="overlay-col-region"></div>

        <el-table :data="filteredViewers" border stripe v-loading="loading">
          <el-table-column prop="emp_id" label="工號" min-width="100" />
          <el-table-column prop="name" label="姓名" min-width="100" />
          <el-table-column prop="unit_name" label="群組" min-width="120" />

          <!-- 🌟 依照你的要求，把前台角色註解掉，但保留程式碼 -->
          <!--
          <el-table-column prop="front_role_name" label="前台角色" min-width="110">
            <template #default="scope">
              <el-tag v-if="scope.row.front_role_name" size="small">{{ scope.row.front_role_name }}</el-tag>
              <span v-else style="color: #909399; font-size: 12px;">無角色</span>
            </template>
          </el-table-column>
          -->
          
          <el-table-column label="閱覽地區" min-width="180">
            <template #default="scope">
              <el-tag 
                v-for="region in formatRegions(scope.row.view_regions_name)" 
                :key="region"
                size="small"
                style="margin-right: 5px; margin-bottom: 5px;"
              >
                {{ region }}
              </el-tag>
            </template>
          </el-table-column>

          <!-- 手機版自動解除 fixed 屬性 -->
          <el-table-column label="操作" min-width="140" :fixed="isMobile ? false : 'right'">
            <template #default="scope">
              <el-button size="small" type="primary" plain @click="handleEdit(scope.row)">編輯</el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <ViewerDialog ref="viewerDialogRef" @success="fetchViewers" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getViewersAPI, deleteViewerAPI } from '../../api/viewers' 
import ViewerDialog from '../../components/admin/ViewerDialog.vue'
import { startTour } from '../../utils/tour' // 🌟 引入導覽工具

const searchQuery = ref('')
const loading = ref(false)
const viewers = ref([])
const viewerDialogRef = ref(null) 

const isMobile = ref(false);
const checkMobile = () => { isMobile.value = window.innerWidth <= 768; }

const fetchViewers = async () => {
  loading.value = true
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const res = await getViewersAPI({ 
      unit_id: user.unit_id, 
      role_level: user.role_level,
      user_id: user.id 
    })
    
    if (res.data.success) {
      viewers.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('載入閱覽權限清單失敗')
  } finally {
    loading.value = false
  }
}

const filteredViewers = computed(() => {
  if (!searchQuery.value) return viewers.value
  return viewers.value.filter(v => 
    v.name.includes(searchQuery.value) || v.emp_id.includes(searchQuery.value)
  )
})

const formatRegions = (str) => str ? str.split(', ') : []

const handleAdd = () => {
  if (viewerDialogRef.value) viewerDialogRef.value.open('add')
}

const handleEdit = (row) => {
  if (viewerDialogRef.value) viewerDialogRef.value.open('edit', row)
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `確定要移除「${row.name}」的閱覽權限嗎？`,
    '警告',
    { confirmButtonText: '確定移除', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('user'));
      const res = await deleteViewerAPI(row.id, currentUser.id)
      
      if (res.data.success) {
        ElMessage.success('刪除成功');
        fetchViewers(); 
      }
    } catch (error) {
      ElMessage.error('刪除失敗');
    }
  }).catch(() => {});
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  fetchViewers()

  // 🌟 啟動導覽
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role_level >= 50) { 
    startTour(`tour_view_auth_${user.id}`, [
      { 
        element: '#tour-view-auth-container', 
        popover: { 
          title: '1. 閱覽權限管理', 
          description: '點擊此處新增閱覽權限、自訂建立閱覽群組與人員配置' 
        } 
      },
      // 🌟 移除了前台角色的步驟，序號順延
      { element: '#tour-col-unit', popover: { title: '2. 單位', description: '此人員所屬的群組單位' } },
      { element: '#tour-col-region', popover: { title: '3. 閱覽地區', description: '依群組設置"選擇"可閱覽區域' } }
    ]);
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-container { display: flex; justify-content: space-between; align-items: center; }
.search-bar { display: flex; align-items: center; }
.mobile-search-input { width: 300px; margin-right: 10px; }

/* 強制 Element Plus 的標籤與按鈕跟隨全站字體縮放 */
:deep(.el-tag),
:deep(.el-button) {
  font-size: 1em;
}

/* 針對 size="small" 的元件微調比例 */
:deep(.el-tag.el-tag--small),
:deep(.el-button.el-button--small) {
  font-size: 0.85em; 
}

/* 🌟 透明圖層：精準蓋住各個直行欄位 (重新計算比例) */
.table-overlay-container {
  position: relative;
}

.overlay-col-unit {
  position: absolute; left: 31%; width: 19%; top: 0; bottom: 0; pointer-events: none; z-index: 1;
}
.overlay-col-region {
  position: absolute; left: 50%; width: 28%; top: 0; bottom: 0; pointer-events: none; z-index: 1;
}

/* 📱 手機版排版 */
@media (max-width: 768px) {
  .view-auth-container { padding: 0; }
  .header-container { flex-direction: column; align-items: flex-start; gap: 15px; }
  .search-bar { flex-direction: column; gap: 10px; }
  .mobile-search-input { width: 100%; margin-right: 0; }
  .mobile-full-btn { width: 100%; margin-left: 0; }
  .search-btn { margin-left: 0 !important; }
  
  :deep(.el-card__header) { padding: 12px; font-weight: bold; }
  :deep(.el-card__body) { padding: 10px; }
  :deep(.el-table .cell) { padding: 0 5px; font-size: 13px; }
}
</style>