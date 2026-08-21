<template>
  <div class="view-auth-container">
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

      <el-table :data="filteredViewers" border stripe v-loading="loading">
        <el-table-column prop="emp_id" label="工號" min-width="100" />
        <el-table-column prop="name" label="姓名" min-width="100" />
        <el-table-column prop="unit_name" label="單位" min-width="120" />

        <el-table-column prop="front_role_name" label="前台角色" min-width="110">
          <template #default="scope">
            <el-tag v-if="scope.row.front_role_name" size="small">{{ scope.row.front_role_name }}</el-tag>
            <span v-else style="color: #909399; font-size: 12px;">無角色</span>
          </template>
        </el-table-column>
        
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

        <!-- 🌟 手機版自動解除 fixed 屬性 -->
        <el-table-column label="操作" min-width="140" :fixed="isMobile ? false : 'right'">
          <template #default="scope">
            <el-button size="small" type="primary" plain @click="handleEdit(scope.row)">編輯</el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <ViewerDialog ref="viewerDialogRef" @success="fetchViewers" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getViewersAPI, deleteViewerAPI } from '../../api/viewers' 
import ViewerDialog from '../../components/admin/ViewerDialog.vue'

const searchQuery = ref('')
const loading = ref(false)
const viewers = ref([])
const viewerDialogRef = ref(null) 

// 🌟 手機版偵測邏輯
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
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-container { display: flex; justify-content: space-between; align-items: center; }
.search-bar { display: flex; align-items: center; }
.mobile-search-input { width: 300px; margin-right: 10px; }
/* 🌟 強制 Element Plus 的標籤與按鈕跟隨全站字體縮放 */
:deep(.el-tag),
:deep(.el-button) {
  font-size: 1em;
}

/* 針對 size="small" 的元件微調比例 */
:deep(.el-tag.el-tag--small),
:deep(.el-button.el-button--small) {
  font-size: 0.85em; 
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