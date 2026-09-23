<script setup>
import { ref, computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useMealPlanStore } from '@/stores/mealPlan'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/constants'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'

const shopping = useShoppingListStore()
const mealPlan = useMealPlanStore()

const selected = ref(new Set())

const active = computed(() => shopping.activeItems)
const purchased = computed(() => shopping.purchasedItems)

// 本月采购小结
const monthlyCount = computed(() => shopping.monthlyHistory.length)
const monthlySpend = computed(() => shopping.monthlySpend)
const catSummary = computed(() => shopping.monthlyCategorySummary)
const catTotal = computed(() => catSummary.value.reduce((s, r) => s + r.amount, 0))
// 占比最高的类别（金额为 0 时不标注）
const topCategory = computed(() =>
  catSummary.value.length && catTotal.value > 0 ? catSummary.value[0] : null,
)

function pctOf(amount) {
  if (!catTotal.value) return 0
  return Math.round((amount / catTotal.value) * 100)
}

function catIcon(category) {
  return CATEGORY_ICONS[category] || '📦'
}

function catColor(category) {
  return CATEGORY_COLORS[category] || '#90a4ae'
}

function toggle(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}

function generate() {
  const count = shopping.generate()
  selected.value = new Set()
  if (!count.length) alert('本周食材库存充足，无需采购！')
}

function markSelected() {
  const n = shopping.markPurchased([...selected.value])
  if (n) {
    selected.value = new Set()
    alert(`已入库 ${n} 种食材 ✅`)
  }
}

function markAll() {
  const n = shopping.markAllPurchased()
  selected.value = new Set()
  if (n) alert(`已采购并入库全部 ${n} 种食材 ✅`)
}

function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>🛒 采购清单</h2>
      <BaseButton @click="generate">根据本周食谱生成清单</BaseButton>
    </div>

    <p class="muted hint">系统会对比本周食谱所需食材总量与当前库存，自动计算缺口数量。</p>

    <div v-if="active.length" class="toolbar card">
      <BaseButton size="sm" @click="markSelected" :disabled="!selected.size">
        标记已采购（{{ selected.size }}）
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="markAll">全部标记已采购并入库</BaseButton>
    </div>

    <BaseEmpty v-if="!active.length && !purchased.length" emoji="🛒" text="暂无采购清单，点击上方按钮生成" />

    <div v-if="active.length" class="card">
      <div class="section-title">待采购 <span class="muted small">缺口 {{ active.reduce((s, i) => s + i.gap, 0) }} 件</span></div>
      <div class="list">
        <div v-for="i in active" :key="i.id" class="shop-row">
          <input type="checkbox" :checked="selected.has(i.id)" @change="toggle(i.id)" />
          <div class="info">
            <div class="name">{{ i.name }}</div>
            <div class="muted small">需 {{ i.required }}{{ i.unit }} · 库存 {{ i.inStock }}{{ i.unit }} · 缺 {{ i.gap }}{{ i.unit }}</div>
          </div>
          <div class="price">
            <span class="muted small">¥</span>
            <input v-model.number="i.price" type="number" min="0" step="0.1" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="purchased.length" class="card">
      <div class="section-title">已采购 <BaseButton size="sm" variant="text" @click="shopping.clearCompleted">清除</BaseButton></div>
      <div class="muted small">
        {{ purchased.map((i) => `${i.name} ${i.gap}${i.unit}`).join('、') }}
      </div>
    </div>

    <div v-if="shopping.history.length" class="card">
      <div class="section-title">采购记录</div>

      <div v-if="monthlyCount" class="month-summary">
        <div class="ms-overview">
          <span>本月采购 <b>{{ monthlyCount }}</b> 次 · 共 <b class="money">¥{{ monthlySpend.toFixed(1) }}</b></span>
          <span v-if="topCategory" class="ms-top">
            🏆 {{ catIcon(topCategory.category) }} {{ topCategory.category }} 占比最高（{{ pctOf(topCategory.amount) }}%）
          </span>
        </div>
        <div class="cat-rows">
          <div
            v-for="row in catSummary"
            :key="row.category"
            class="cat-row"
            :class="{ top: topCategory && row.category === topCategory.category }"
          >
            <span class="cat-name">
              {{ catIcon(row.category) }} {{ row.category }}
              <i v-if="topCategory && row.category === topCategory.category" class="crown">👑</i>
            </span>
            <div class="bar">
              <div class="fill" :style="{ width: pctOf(row.amount) + '%', background: catColor(row.category) }"></div>
            </div>
            <span class="amount">¥{{ row.amount.toFixed(1) }}</span>
            <span class="pct muted">{{ pctOf(row.amount) }}%</span>
          </div>
        </div>
      </div>

      <div class="history">
        <div v-for="h in shopping.history" :key="h.id" class="hist-row">
          <span class="muted">{{ fmtDate(h.date) }}</span>
          <span class="items">{{ h.items.map((i) => i.name).join('、') }}</span>
          <span class="total">¥{{ (h.total || 0).toFixed(1) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.page-head h2 {
  margin: 0;
}
.hint {
  margin-bottom: 16px;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.small {
  font-size: 12px;
}
.list {
  display: flex;
  flex-direction: column;
}
.shop-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.shop-row:last-child {
  border-bottom: none;
}
.info {
  flex: 1;
}
.name {
  font-weight: 600;
}
.price {
  display: flex;
  align-items: center;
  gap: 4px;
}
.price input {
  width: 70px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: right;
}
.history {
  display: flex;
  flex-direction: column;
}
.month-summary {
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.ms-overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 10px;
}
.ms-overview .money {
  color: var(--primary-dark);
}
.ms-top {
  color: var(--warn);
  font-weight: 600;
  font-size: 12px;
}
.cat-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 8px;
}
.cat-row.top {
  background: var(--warn-light);
}
.cat-name {
  width: 76px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.cat-row.top .cat-name {
  font-weight: 600;
}
.crown {
  font-style: normal;
  font-size: 12px;
}
.bar {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 4px;
}
.amount {
  width: 64px;
  text-align: right;
  font-weight: 600;
  color: var(--primary-dark);
}
.pct {
  width: 38px;
  text-align: right;
  font-size: 12px;
}
.hist-row {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.hist-row:last-child {
  border-bottom: none;
}
.hist-row .items {
  flex: 1;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.total {
  font-weight: 600;
  color: var(--primary-dark);
}
</style>
