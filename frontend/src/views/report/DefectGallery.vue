D:\維護中資料(待上傳git)\YouBike-inspection-dashboard\frontend\src\views\report\DefectGallery.vue
<template>
  <div class="gallery-container">
    <el-card>
      <template #header>
        <div class="mobile-header">
          <h2>缺失明細與照片檢視</h2>
          <div class="header-right-actions">
            <el-select v-model="selectedMonth" placeholder="選擇月份" @change="fetchData" style="width: 120px;">
              <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
            </el-select>
            <el-select v-model="selectedCity" placeholder="全部營運區" clearable @change="fetchData" style="width: 140px;">
              <el-option v-for="c in cityOptions" :key="c" :label="c" :value="c" />
            </el-select>
        <!--<el-button type="success" @click="exportToExcel" :disabled="tableData.length === 0">
              <el-icon><Download /></el-icon> 匯出 Excel
            </el-button>-->
          </div>
        </div>
      </template>

      <!-- 🌟 改為綁定 pagedTableData (分頁後的資料) -->
      <el-table :data="pagedTableData" v-loading="loading" border stripe style="width: 100%" height="calc(100vh - 270px)">
        <el-table-column prop="created_at" label="巡檢時間" width="150" align="center">
          <template #default="scope">
            {{ formatTime(scope.row.created_at) }}
          </template>
        </el-table-column>
        
        <el-table-column prop="city" label="縣市" width="100" align="center" />
        <el-table-column prop="station_name" label="場站名稱" min-width="220" show-overflow-tooltip />
        
        <!-- 🌟 新增車型欄位 -->
        <el-table-column prop="model" label="車型" width="80" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.model === '2.0E' ? 'warning' : 'success'" size="small">
              {{ scope.row.model || '無' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="bike_no" label="車號" width="130" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.bike_no === '無/場站缺失' ? 'info' : 'primary'">{{ scope.row.bike_no }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="缺失明細" min-width="320">
          <template #default="scope">
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
              <el-tag 
                v-for="(defect, index) in scope.row.defect_list" 
                :key="index" 
                size="small" 
                :type="getTagType(defect)"
              >
                {{ defect }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <!-- 🌟 新增各項備註 (使用 show-overflow-tooltip 滑鼠移過去顯示完整內容) -->
        <el-table-column prop="dock_note" label="車柱備註" min-width="100" show-overflow-tooltip />
        <el-table-column prop="appearance_note" label="外觀備註" min-width="100" show-overflow-tooltip />
        <el-table-column prop="structure_note" label="結構備註" min-width="100" show-overflow-tooltip />
        <el-table-column prop="other_note" label="其他備註" min-width="100" show-overflow-tooltip />
        
        <el-table-column label="佐證照片" width="110" align="center" fixed="right">
          <template #default="scope">
            <el-button 
              :type="scope.row.photo_count > 0 ? 'primary' : 'info'" 
              :plain="scope.row.photo_count === 0"
              size="small" 
              @click="openPhotoDrawer(scope.row)"
            >
              <el-icon style="margin-right: 4px;"><Picture /></el-icon> 
              查看 ({{ scope.row.photo_count }})
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 🌟 分頁控制條 (一頁 50 筆) -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="50"
          layout="total, prev, pager, next, jumper"
          :total="tableData.length"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <el-drawer v-model="drawerVisible" title="佐證照片預覽" size="450px" destroy-on-close>
      <div v-loading="photoLoading" style="height: 100%;">
        <div v-if="photoList.length === 0 && !photoLoading" class="no-photo">
          <el-empty description="此筆巡檢無上傳照片 (或尚未載入)" />
        </div>
        
        <div v-else class="photo-list">
          <div v-for="(photo, index) in photoList" :key="index" class="photo-card">
            <el-image 
              :src="photo.url" 
              :preview-src-list="photoList.map(p => p.url)"
              :initial-index="index"
              fit="contain"
              class="preview-image"
            />
            <div class="photo-actions">
              <span class="photo-name">{{ photo.name }}</span>
              <el-button type="primary" size="small" circle @click="downloadImage(photo.url)">
                <el-icon><Download /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, Download } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import { getDefectListAPI, getDefectPhotosAPI } from '../../api/defect'
import { getReportMonthsAPI, getReportCitiesAPI } from '../../api/report'

const loading = ref(false)
const tableData = ref([])
const selectedMonth = ref('')
const selectedCity = ref('')
const monthOptions = ref([])
const cityOptions = ref([])

// 🌟 分頁變數設定
const currentPage = ref(1)
const pageSize = 50

const drawerVisible = ref(false)
const photoLoading = ref(false)
const photoList = ref([])

const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// 🌟 計算當前頁面該顯示的 50 筆資料
const pagedTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return tableData.value.slice(start, start + pageSize);
})

const handlePageChange = (val) => {
  currentPage.value = val;
}

const fetchFilters = async () => {
  try {
    const [monthRes, cityRes] = await Promise.all([
      getReportMonthsAPI(currentUser.role_level),
      getReportCitiesAPI(currentUser.id, currentUser.role_level)
    ]);
    if (monthRes.data.success) monthOptions.value = monthRes.data.data;
    if (cityRes.data.success) cityOptions.value = cityRes.data.data;
    
    if (monthOptions.value.length > 0) {
      selectedMonth.value = monthOptions.value[0];
      fetchData();
    }
  } catch (error) { console.error('過濾器載入失敗', error); }
}

const fetchData = async () => {
  if (!selectedMonth.value) return;
  loading.value = true;
  try {
    const res = await getDefectListAPI(selectedMonth.value, selectedCity.value, currentUser.id, currentUser.role_level);
    if (res.data.success) {
      tableData.value = res.data.data;
      currentPage.value = 1; // 🌟 重新撈資料時，分頁重置回第 1 頁
    }
  } catch (error) {
    ElMessage.error('取得清單失敗');
  } finally {
    loading.value = false;
  }
}

const getTagType = (defectString) => {
  if (defectString.includes('[A級]')) return 'danger';
  if (defectString.includes('[B級]')) return 'warning';
  return 'info';
}

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setHours(d.getHours() + 8); 
  
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const openPhotoDrawer = async (row) => {
  drawerVisible.value = true;
  photoLoading.value = true;
  photoList.value = []; 

  try {
    const res = await getDefectPhotosAPI(row.id);
    if (res.data.success) {
      photoList.value = res.data.data;
      row.photo_count = photoList.value.length; // 自動校正數量
    }
  } catch (error) {
    ElMessage.error('無法載入照片，請檢查後端狀態');
    console.error(error);
  } finally {
    photoLoading.value = false;
  }
}

const downloadImage = (url) => {
  window.open(url, '_blank');
}

const exportToExcel = () => {
  // 🌟 Excel 匯出也包含所有的備註與車型
  const exportData = tableData.value.map(row => ({
    '巡檢時間': formatTime(row.created_at),
    '縣市': row.city,
    '場站名稱': row.station_name,
    '車型': row.model || '無',
    '車號': row.bike_no,
    '缺失明細': row.defect_summary,
    '車柱備註': row.dock_note,
    '外觀備註': row.appearance_note,
    '結構備註': row.structure_note,
    '其他備註': row.other_note,
    '照片數量': row.photo_count
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '缺失明細');
  
  const fileName = `${selectedMonth.value}_${selectedCity.value || '全區'}_缺失明細表.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

onMounted(() => fetchFilters());
</script>

<style scoped>

:deep(.el-tag) {
  font-size: 0.95em;      /* 改用 em，讓它跟隨外層表格的字體等比例縮放 */
  height: auto;           /* 解除預設的固定高度，避免字體放大後被裁切 */
  padding: 4px 8px;       /* 給予適當的內距 */
  line-height: 1.4;       /* 增加行高，讓文字大時更好閱讀 */
  white-space: normal;    /* 允許缺失明細如果文字太長時可以自動換行 */
  text-align: left;       /* 確保換行時文字對齊 */
}

.gallery-container { padding: 0 10px; }
h2 { margin: 0; }

.mobile-header {
  display: flex; justify-content: space-between; align-items: center; width: 100%;
}
.header-right-actions {
  display: flex; align-items: center; gap: 15px;
}



/* 🌟 分頁的樣式 */
.pagination-wrapper {
  margin-top: 15px;
  display: flex;
  justify-content: flex-end;
  padding: 5px 0;
}

.photo-list {
  display: flex; flex-direction: column; gap: 20px; padding: 10px;
}
.photo-card {
  border: 1px solid #EBEEF5; border-radius: 8px; padding: 10px; background: #fafafa;
}
.preview-image {
  width: 100%; height: 250px; border-radius: 4px; background: #000; cursor: pointer;
}
.photo-actions {
  display: flex; justify-content: space-between; align-items: center; margin-top: 10px;
}
.photo-name {
  font-size: 12px; color: #606266; word-break: break-all;
}

@media (max-width: 768px) {
  .mobile-header { flex-direction: column; align-items: flex-start; gap: 15px; }
  .header-right-actions { flex-direction: column; width: 100%; gap: 10px; }
  .header-right-actions .el-select, .header-right-actions .el-button { width: 100% !important; margin-left: 0 !important; }
}
</style>