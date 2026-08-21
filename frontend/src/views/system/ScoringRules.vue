<template>
  <div class="scoring-container">
    <div class="header">
      <h2>📊 計分規則設定</h2>
      <div class="actions">
        <el-button type="primary" @click="handleSave" :loading="saving" class="mobile-btn">
          <el-icon><Check /></el-icon> 儲存所有變更
        </el-button>
      </div>
    </div>


    
    <!-- 🌟 加入 loading 與 cell-class-name 精準單格高亮 -->
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

      <!-- 🌟 每一個 column 都有專屬的 prop，才能讓系統知道哪一格被改了 -->
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

      <el-table-column label="合併扣分" prop="merge_group" min-width="180">
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
          <!-- 🌟 乾淨的輸入框，沒有任何 @change 事件干擾 -->
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
import { Check } from '@element-plus/icons-vue'
import { getScoringRulesAPI, batchUpdateRulesAPI } from '../../api/scoring'

const tableData = ref([])
const originalData = ref([]) // 用來備份比對
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

// 🌟 精準判斷「單一格子」是否被修改
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
      // 標準化資料，把所有 null 或 undefined 清洗乾淨，避免誤判高亮
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
      // 深度拷貝當作備份對照組
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
    // =======================================================
    // 🌟 移除：自動對齊同群組分數的邏輯 (因為現在允許不同分數，由後端結算時取最大扣分)
    // =======================================================
    
    // 直接呼叫 API 送出目前的表格資料
    const res = await batchUpdateRulesAPI({ rules: tableData.value })
    if (res.data.success) {
      ElMessage.success('所有規則已成功儲存！')
      fetchData() // 重新抓取資料，更新備份，讓高亮橘色提示消失
    }
  } catch (error) { 
    ElMessage.error('儲存失敗') 
  } finally { 
    saving.value = false 
  }
}

onMounted(fetchData)
</script>

<style scoped>
.scoring-container { padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1); }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.actions { display: flex; gap: 15px; align-items: center; }
h2 { margin: 0; color: #303133; font-size: 20px; }

/* 🌟 解除字體大小鎖定 */
:deep(.el-table th.el-table__cell),
:deep(.el-table .cell),
:deep(.el-input__inner),
:deep(.el-button),
:deep(.el-alert__title),
:deep(.el-alert__description) {
  font-size: 1em !important;
}

/* 🌟 解除高度限制，讓格子可以被撐開 */
:deep(.el-input--small .el-input__wrapper),
:deep(.el-input-number--small) {
  height: auto !important;
  min-height: 32px; 
  padding-top: 4px;
  padding-bottom: 4px;
}

/* 🌟 數字按鈕鎖死：強制給定 px 大小，拒絕跟隨 em 放大而蓋住文字 */
:deep(.el-input-number--small .el-input-number__decrease),
:deep(.el-input-number--small .el-input-number__increase) {
  font-size: 13px !important;
  width: 32px !important;
}
/* 🌟 把中間輸入框的 Padding 留給固定的按鈕，確保文字不會被遮住 */
:deep(.el-input-number--small .el-input__wrapper) {
  padding-left: 36px !important;
  padding-right: 36px !important;
}

/* 群組顏色圓點樣式 */
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

/* 🌟 單獨修改的格子會變成淺橘色 */
:deep(.el-table .modified-cell) {
  background-color: #fdf6ec !important; 
  transition: background-color 0.3s;
}
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.modified-cell) {
  background-color: #fdf6ec !important; 
}

/* 手機版排版 */
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
/* 下拉選單展開放大 (必須放在全域不加 scoped) */
.el-select-dropdown__item {
  font-size: 1em !important;
}
</style>