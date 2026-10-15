<template>
  <!-- 🌟 加上 id="tour-scoring-container" 讓導覽框住整個畫面 -->
  <div id="tour-scoring-container" class="scoring-container">
    <div class="header">
      <h2>📊 計分規則設定</h2>
      <div class="actions">
        <el-button type="primary" @click="handleSave" :loading="saving" class="mobile-btn">
          <el-icon><Check /></el-icon> 儲存所有變更
        </el-button>
      </div>
    </div>
    
    <el-table 
      :data="tableData" 
      :cell-class-name="tableCellClassName"
      v-loading="loading || saving"
      element-loading-text="資料載入中，請稍候..."
      element-loading-background="rgba(255, 255, 255, 0.7)"
      border stripe
      height="calc(100vh - 200px)"
      style="width: 100%;" 
    >
      <el-table-column label="資料庫欄位" prop="item_key" min-width="150" fixed="left" show-overflow-tooltip />

      <el-table-column label="車種" prop="bike_type" min-width="110" header-align="center">
        <template #default="scope">
          <el-select v-model="scope.row.bike_type" size="small">
            <el-option label="ALL" value="ALL" />
            <el-option label="2.0" value="2.0" />
            <el-option label="2.0E" value="2.0E" />
          </el-select>
        </template>
      </el-table-column>

      <el-table-column label="類別" prop="major_category" min-width="140" show-overflow-tooltip>
        <template #default="scope">
          <el-select v-model="scope.row.major_category" size="small" allow-create filterable>
            <el-option value="場站" />
            <el-option value="自行車外觀與重要標示" />
            <el-option value="自行車重要機能" />
          </el-select>
        </template>
      </el-table-column>

      <el-table-column label="中項" prop="sub_category" min-width="130">
        <template #default="scope">
          <el-input v-model="scope.row.sub_category" size="small" />
        </template>
      </el-table-column>

      <el-table-column label="細項" prop="item_name" min-width="160" show-overflow-tooltip>
        <template #default="scope">
          <el-input v-model="scope.row.item_name" size="small" />
        </template>
      </el-table-column>

      <!-- 🌟 合併扣分：加入問號與 Tooltip 提示 -->
      <el-table-column prop="merge_group" min-width="180" label-class-name="tour-merge-group-header">
        <template #header>
          合併扣分
          <el-tooltip effect="dark" placement="top">
            <template #content>
              <div style="line-height: 1.5;">
                以相同文字作為合併扣分依據
              </div>
            </template>
            <el-icon style="margin-left: 4px; cursor: help; vertical-align: middle;"><QuestionFilled /></el-icon>
          </el-tooltip>
        </template>
        <template #default="scope">
          <el-select
            v-model="scope.row.merge_group"
            size="small"
            clearable filterable allow-create default-first-option
            placeholder="選擇或輸入群組" style="width: 100%" class="group-select"
          >
            <template #prefix v-if="scope.row.merge_group">
              <div class="color-dot" :style="{ backgroundColor: stringToColor(scope.row.merge_group) }"></div>
            </template>
            
            <el-option
              v-for="group in availableMergeGroups"
              :key="group"
              :label="group"
              :value="group"
            >
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="color-dot" :style="{ backgroundColor: stringToColor(group) }"></span>
                <span style="font-weight: bold;">{{ group }}</span>
              </div>
            </el-option>
          </el-select>
        </template>
      </el-table-column>

      <el-table-column label="等級" prop="severity" min-width="90" align="center">
        <template #default="scope">
          <el-select v-model="scope.row.severity" size="small">
            <el-option label="A" value="A" />
            <el-option label="B" value="B" />
            <el-option label="C" value="C" />
          </el-select>
        </template>
      </el-table-column>

      <el-table-column label="扣分" prop="deduction_points" width="120" fixed="right">
        <template #default="scope">
          <el-input-number 
            v-model="scope.row.deduction_points" 
            :min="-100" :max="0" :step="1" size="small" style="width: 100%" 
          />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, QuestionFilled } from '@element-plus/icons-vue' // 🌟 記得引入 QuestionFilled
import { getScoringRulesAPI, batchUpdateRulesAPI } from '../../api/scoring'
import { startTour } from '../../utils/tour' 

const tableData = ref([])
const originalData = ref([]) 
const loading = ref(false)
const saving = ref(false)

const availableMergeGroups = computed(() => {
  const groups = new Set();
  tableData.value.forEach(row => {
    if (row.merge_group && row.merge_group.trim() !== '') {
      groups.add(row.merge_group.trim());
    }
  });
  return Array.from(groups).sort();
});

const stringToColor = (str) => {
  if (!str) return 'transparent';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    let value = (hash >> (i * 8)) & 0xFF;
    value = Math.floor((value + 255) / 2); 
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

const tableCellClassName = ({ row, column }) => {
  if (!originalData.value.length || !column.property) return '';
  const orig = originalData.value.find(o => o.id === row.id);
  if (!orig) return '';
  
  const prop = column.property;
  const editableProps = ['bike_type', 'major_category', 'sub_category', 'item_name', 'merge_group', 'severity', 'deduction_points'];
  
  if (editableProps.includes(prop)) {
    let currentVal = row[prop];
    let origVal = orig[prop];

    if (prop === 'deduction_points') {
      if (Number(currentVal || 0) !== Number(origVal || 0)) return 'modified-cell';
    } else {
      if (String(currentVal || '').trim() !== String(origVal || '').trim()) return 'modified-cell';
    }
  }
  return '';
};

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getScoringRulesAPI()
    if (res.data.success) {
      const normalizedData = res.data.data.map(item => ({
        ...item,
        bike_type: item.bike_type || 'ALL',
        major_category: item.major_category || '',
        sub_category: item.sub_category || '',
        item_name: item.item_name || '',
        merge_group: item.merge_group || '',
        severity: item.severity || 'C',
        deduction_points: Number(item.deduction_points) || 0
      }));
      
      tableData.value = normalizedData;
      originalData.value = JSON.parse(JSON.stringify(normalizedData));
    }
  } catch (error) { 
    ElMessage.error('載入計分規則失敗') 
  } finally { 
    loading.value = false 
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    const res = await batchUpdateRulesAPI({ rules: tableData.value })
    if (res.data.success) {
      ElMessage.success('所有規則已成功儲存！')
      fetchData() 
    }
  } catch (error) { 
    ElMessage.error('儲存失敗') 
  } finally { 
    saving.value = false 
  }
}

onMounted(() => {
  fetchData();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  startTour(`tour_scoring_${user.id}`, [
    { 
      element: '#tour-scoring-container', 
      popover: { 
        title: '1. 評分項目管理', 
        description: '評分項目分類、等級及扣分設置' 
      } 
    },
    { 
      element: '.tour-merge-group-header', 
      popover: { 
        title: '2. 合併扣分', 
        description: '以相同文字作為合併扣分依據' 
      } 
    }
  ]);
})
</script>

<style scoped>
.scoring-container { padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1); }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.actions { display: flex; gap: 15px; align-items: center; }
h2 { margin: 0; color: #303133; font-size: 20px; }

:deep(.el-table th.el-table__cell),
:deep(.el-table .cell),
:deep(.el-input__inner),
:deep(.el-button),
:deep(.el-alert__title),
:deep(.el-alert__description) {
  font-size: 1em !important;
}

:deep(.el-input--small .el-input__wrapper),
:deep(.el-input-number--small) {
  height: auto !important;
  min-height: 32px; 
  padding-top: 4px;
  padding-bottom: 4px;
}

:deep(.el-input-number--small .el-input-number__decrease),
:deep(.el-input-number--small .el-input-number__increase) {
  font-size: 13px !important;
  width: 32px !important;
}

:deep(.el-input-number--small .el-input__wrapper) {
  padding-left: 36px !important;
  padding-right: 36px !important;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 2px rgba(0,0,0,0.2);
}

:deep(.group-select .el-input__prefix-inner) {
  align-items: center;
  padding-left: 5px;
}

:deep(.el-table .modified-cell) {
  background-color: #fdf6ec !important; 
  transition: background-color 0.3s;
}
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.modified-cell) {
  background-color: #fdf6ec !important; 
}

@media (max-width: 768px) {
  .scoring-container { padding: 10px; }
  .header { flex-direction: column; align-items: flex-start; gap: 15px; }
  .actions { width: 100%; flex-direction: column; gap: 10px; }
  .mobile-btn { width: 100%; margin-left: 0 !important; }
  
  :deep(.el-alert__title),
  :deep(.el-alert__description) { font-size: 0.85em !important; line-height: 1.4; }
  :deep(.el-table .cell),
  :deep(.el-table th.el-table__cell),
  :deep(.el-input__inner) { font-size: 0.9em !important; }
}
</style>

<style>
.el-select-dropdown__item {
  font-size: 1em !important;
}
</style>