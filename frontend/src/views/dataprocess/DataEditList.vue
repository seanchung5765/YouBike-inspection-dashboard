<!--frontend/src/views/dataprocess/DataEditList.vue-->
<template>
  <div class="data-edit-container">
    <el-card>
      <template #header>
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h2>每月資料修正</h2>
          <div style="display: flex; gap: 10px; align-items: center;">
            <el-button type="danger" plain @click="executeBatchDelete" :disabled="!hasSelection">
              <el-icon><Delete style="margin-right: 5px;"/></el-icon> 刪除勾選 ({{ selectedCount }})
            </el-button>
          </div>
        </div>
      </template>

      <div class="filter-section">
        <div class="filter-item">
          <span class="filter-label">月份</span>
          <el-select v-model="selectedMonth" style="width: 130px;">
            <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
          </el-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">城市</span>
          <el-select v-model="selectedCity" placeholder="全選" clearable style="width: 120px;">
            <el-option v-for="c in cityOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </div>
        <div class="filter-item" v-if="activeTab === 'bike'">
          <span class="filter-label">評分人員</span>
          <el-select v-model="selectedChecker" placeholder="全選" clearable style="width: 120px;">
            <el-option v-for="c in checkerOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </div>
      </div>

      <el-tabs v-model="activeTab" type="border-card" @tab-click="handleTabClick">
        <!-- ================================================== -->
        <!-- 🏠 場站總覽 (Station View) -->
        <!-- ================================================== -->
        <el-tab-pane label="Station" name="station">
          <el-table :data="paginatedStationData" style="width: 100%" v-loading="loading" border stripe height="600" @selection-change="handleStationSelection">
            <el-table-column type="selection" width="50" fixed align="center" />
            <el-table-column type="index" label="序號" width="70" fixed align="center" :index="(index) => (currentPageStation - 1) * pageSizeStation + index + 1" />
            <el-table-column label="巡檢時間" prop="created_at" width="140" sortable fixed>
              <template #default="scope">
                {{ scope.row.created_at ? String(scope.row.created_at).substring(0, 10) : '' }}
              </template>
            </el-table-column>
            <el-table-column label="前台角色" prop="front_role" width="120" fixed />
            <el-table-column label="工號" prop="checker" width="110" fixed sortable />
            <el-table-column label="縣市" prop="city" width="110" fixed sortable align="center" />
            <el-table-column label="場站名稱" prop="station_name" min-width="180" fixed show-overflow-tooltip sortable />
            
            <el-table-column label="場站車輛數" width="130" align="center">
              <template #default="scope">
                <el-input-number v-model="scope.row.bikes_in_dock_count" size="small" :min="0" :controls="false" style="width: 100%" @change="autoSaveStation(scope.row, 'bikes_in_dock_count', scope.row.bikes_in_dock_count)" />
              </template>
            </el-table-column>
            
            <el-table-column label="座椅反轉" width="130" align="center">
              <template #default="scope">
                <el-input-number v-model="scope.row.reversed_saddle_count" size="small" :min="0" :controls="false" style="width: 100%" @change="autoSaveStation(scope.row, 'reversed_saddle_count', scope.row.reversed_saddle_count)" />
              </template>
            </el-table-column>
            
            <el-table-column label="車機無法喚醒" width="170" align="center">
              <template #default="scope">
                <el-input-number v-model="scope.row.inactive_bike_count" size="small" :min="0" :controls="false" style="width: 100%" @change="autoSaveStation(scope.row, 'inactive_bike_count', scope.row.inactive_bike_count)" />
              </template>
            </el-table-column>

            <el-table-column label="場站備註說明" min-width="200">
              <template #default="scope">
                <el-input v-model="scope.row.station_note" placeholder="輸入備註" @blur="autoSaveStation(scope.row, 'station_note', scope.row.station_note)" />
              </template>
            </el-table-column>
          </el-table>

          <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
            <el-pagination
              v-model:current-page="currentPageStation"
              v-model:page-size="pageSizeStation"
              :page-sizes="[50, 100, 300, 500]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="filteredTableData.length"
            />
          </div>
        </el-tab-pane>

        <!-- ================================================== -->
        <!-- 🚲 單車明細 (Bike View) -->
        <!-- ================================================== -->
        <el-tab-pane label="Bike" name="bike">
          <el-table :data="bikeData" style="width: 100%" v-loading="loading" height="600" border stripe @selection-change="handleBikeSelection">
            <el-table-column type="selection" width="50" fixed align="center" />
            <el-table-column type="index" label="序號" width="70" fixed align="center" :index="(index) => (currentPageBike - 1) * pageSizeBike + index + 1" />
            <el-table-column label="巡檢時間" prop="created_at" width="140" sortable fixed>
              <template #default="scope">
                {{ scope.row.created_at ? String(scope.row.created_at).substring(0, 10) : '' }}
              </template>
            </el-table-column>
            <el-table-column prop="checker" label="評分人員" width="140" fixed sortable />
            <el-table-column prop="model" label="車種" width="80" fixed align="center" />
            <el-table-column prop="station_name" label="場站名稱" min-width="180" fixed show-overflow-tooltip sortable />
            <el-table-column prop="bike_no" label="車號" width="110" fixed align="center" sortable>
              <template #default="scope"><b>{{ scope.row.bike_no || '無' }}</b></template>
            </el-table-column>
            
            <!-- 🌟 將 width 改為 min-width="120"，讓很長的表頭（如：外觀及環境_兩側貼紙）能完整顯示 -->
            <el-table-column 
              v-for="col in allBikeParts" 
              :key="col.prop" 
              :label="col.label" 
              min-width="300" 
              align="center"
              show-overflow-tooltip
            >
              <template #default="scope">
                <input 
                  type="checkbox" 
                  class="fast-checkbox"
                  :checked="scope.row[col.prop] === 1" 
                  @change="(e) => handleNativeCheckbox(scope.row, col.prop, e.target.checked)" 
                />
              </template>
            </el-table-column>

            <el-table-column label="前胎壓" width="80" align="center">
              <template #default="scope">
                <input type="number" class="fast-input" v-model.lazy="scope.row.front_tire_psi" @change="autoSaveBike(scope.row, 'front_tire_psi', scope.row.front_tire_psi)" />
              </template>
            </el-table-column>
            <el-table-column label="後胎壓" width="80" align="center">
              <template #default="scope">
                <input type="number" class="fast-input" v-model.lazy="scope.row.rear_tire_psi" @change="autoSaveBike(scope.row, 'rear_tire_psi', scope.row.rear_tire_psi)" />
              </template>
            </el-table-column>

            <!-- 🌟 備註類因為內容長短不一，一律改用 min-width 讓它彈性伸縮 -->
            <el-table-column label="車柱備註" min-width="160">
              <template #default="scope"><input type="text" class="fast-input" v-model.lazy="scope.row.dock_note" @blur="autoSaveBike(scope.row, 'dock_note', scope.row.dock_note)" /></template>
            </el-table-column>
            <el-table-column label="外觀備註" min-width="160">
              <template #default="scope"><input type="text" class="fast-input" v-model.lazy="scope.row.appearance_note" @blur="autoSaveBike(scope.row, 'appearance_note', scope.row.appearance_note)" /></template>
            </el-table-column>
            <el-table-column label="結構備註" min-width="160">
              <template #default="scope"><input type="text" class="fast-input" v-model.lazy="scope.row.structure_note" @blur="autoSaveBike(scope.row, 'structure_note', scope.row.structure_note)" /></template>
            </el-table-column>
            <el-table-column label="其他備註" min-width="160">
              <template #default="scope"><input type="text" class="fast-input" v-model.lazy="scope.row.other_note" @blur="autoSaveBike(scope.row, 'other_note', scope.row.other_note)" /></template>
            </el-table-column>
          </el-table>

          <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
            <el-pagination
              v-model:current-page="currentPageBike"
              v-model:page-size="pageSizeBike"
              :page-sizes="[20, 50, 100, 200]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="totalBikes"
              @size-change="handleBikePageChange"
              @current-change="handleBikePageChange"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { 
  getStationsSummaryAPI, getFilterOptionsAPI, getFlatBikesAPI, 
  updateStationCellAPI, updateBikeCellAPI,
  batchDeleteStationsAPI, batchDeleteBikesAPI
} from '../../api/dataProcess'
import { getScoringRulesAPI } from '../../api/scoring'

const loading = ref(false)
const monthOptions = ref([])
const cityOptions = ref([])
const checkerOptions = ref([])

const selectedMonth = ref('')
const selectedCity = ref('')
const selectedChecker = ref('')

const activeTab = ref('station')

// 🏠 場站資料存放
const rawTableData = ref([])
const currentPageStation = ref(1)
const pageSizeStation = ref(50)

// 🚲 單車資料存放
const bikeData = ref([])
const totalBikes = ref(0)
const currentPageBike = ref(1)
const pageSizeBike = ref(50)

const selectedStations = ref([])
const selectedBikes = ref([])
const hasSelection = computed(() => activeTab.value === 'station' ? selectedStations.value.length > 0 : selectedBikes.value.length > 0)
const selectedCount = computed(() => activeTab.value === 'station' ? selectedStations.value.length : selectedBikes.value.length)

const handleStationSelection = (val) => { selectedStations.value = val }
const handleBikeSelection = (val) => { selectedBikes.value = val }

// 🌟 動態欄位宣告
const allBikeParts = ref([]) 

const fetchFilters = async () => {
  try {
    const res = await getFilterOptionsAPI()
    if (res.data.success) {
      monthOptions.value = res.data.data.months
      cityOptions.value = res.data.data.cities
      checkerOptions.value = res.data.data.checkers || []
      if (monthOptions.value.length > 0) selectedMonth.value = monthOptions.value[0]
    }
  } catch (error) {}
}

const fetchScoringRules = async () => {
  try {
    const res = await getScoringRulesAPI()
    if (res.data.success) {
      // 🌟 修正點 1：過濾條件改成 large_category !== '場站'，確保跟 Excel 一樣有撈到「車柱」
      // 🌟 修正點 2：補上 .sort()，依照你資料庫建好的 sort_order 排序
      const bikeRules = res.data.data
        .filter(rule => rule.large_category !== '場站')
        .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
        
      allBikeParts.value = bikeRules.map(rule => ({
        prop: rule.item_key,
        label: `${rule.large_category}_${rule.sub_category}_${rule.item_name}` 
      }))
    }
  } catch (error) {
    console.error('抓取動態欄位失敗', error)
  }
}

const fetchData = async () => {
  if (!selectedMonth.value) return;
  loading.value = true
  try {
    const res = await getStationsSummaryAPI(selectedMonth.value)
    if (res.data.success) rawTableData.value = res.data.data
  } finally { loading.value = false }
}

const fetchBikeData = async () => {
  if (!selectedMonth.value) return;
  loading.value = true
  try {
    const res = await getFlatBikesAPI(
      selectedMonth.value, 
      selectedCity.value, 
      selectedChecker.value,
      currentPageBike.value,
      pageSizeBike.value
    )
    if (res.data.success) {
      bikeData.value = res.data.data
      totalBikes.value = res.data.total
    }
  } finally { loading.value = false }
}

const handleBikePageChange = () => {
  fetchBikeData()
}

const handleTabClick = (tab) => {
  if (tab.paneName === 'bike' && bikeData.value.length === 0) fetchBikeData()
}

watch([selectedMonth, selectedCity, selectedChecker], () => {
  currentPageStation.value = 1
  currentPageBike.value = 1
  fetchData()
  if (activeTab.value === 'bike') {
    fetchBikeData()
  } else {
    bikeData.value = []
    totalBikes.value = 0
  }
})

const filteredTableData = computed(() => rawTableData.value.filter(item => selectedCity.value === '' || item.city === selectedCity.value))
const paginatedStationData = computed(() => filteredTableData.value.slice((currentPageStation.value - 1) * pageSizeStation.value, currentPageStation.value * pageSizeStation.value))

const autoSaveStation = async (row, field, value) => {
  try {
    await updateStationCellAPI({ month: selectedMonth.value, station_id: row.station_id, field, value })
    ElMessage.success('儲存成功')
  } catch (error) { ElMessage.error('儲存失敗') }
}

const autoSaveBike = async (row, field, value) => {
  try {
    await updateBikeCellAPI({ id: row.id, field, value })
    ElMessage.success('儲存成功')
  } catch (error) { ElMessage.error('儲存失敗') }
}

const handleNativeCheckbox = (row, field, isChecked) => {
  const val = isChecked ? 1 : 0;
  row[field] = val; 
  autoSaveBike(row, field, val); 
}

const executeBatchDelete = () => {
  ElMessageBox.confirm(`確定要刪除已勾選的 ${selectedCount.value} 筆資料嗎？`, '刪除警告', { type: 'warning' })
    .then(async () => {
      loading.value = true
      try {
        if (activeTab.value === 'station') {
          await batchDeleteStationsAPI({ month: selectedMonth.value, stationIds: selectedStations.value.map(s => s.station_id) })
        } else {
          await batchDeleteBikesAPI({ ids: selectedBikes.value.map(b => b.id) })
        }
        ElMessage.success('批次刪除成功！')
        fetchData()
        if (activeTab.value === 'bike') fetchBikeData()
      } catch (error) { ElMessage.error('刪除失敗') } 
      finally { loading.value = false }
    }).catch(() => {})
}

onMounted(() => {
  fetchFilters()
  fetchScoringRules() 
})
</script>

<style scoped>
.data-edit-container { padding: 20px; }
.card-header h2 { margin: 0; font-size: 20px; }
.filter-section { display: flex; align-items: center; gap: 30px; margin-bottom: 20px; background-color: #f8f9fa; padding: 15px 20px; border-radius: 8px; }
.filter-item { display: flex; align-items: center; gap: 10px; }
.filter-label { font-weight: bold; font-size: 16px; }
:deep(.el-tabs__content) { padding: 15px 0 0 0; }


.fast-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #409EFF; 
  margin: 0;
  vertical-align: middle;
}

.fast-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  color: #606266;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s cubic-bezier(.645,.045,.355,1);
  background-color: #fff;
}

.fast-input:focus {
  border-color: #409EFF;
}

.fast-input:hover {
  border-color: #c0c4cc;
}

.fast-input[type=number]::-webkit-inner-spin-button, 
.fast-input[type=number]::-webkit-outer-spin-button { 
  -webkit-appearance: none; 
  margin: 0; 
}
</style>