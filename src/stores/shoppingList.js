import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'

const LIST_KEY = 'shopping-list'
const HISTORY_KEY = 'shopping-history'

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    items: read(LIST_KEY, []),
    history: read(HISTORY_KEY, []), // 采购记录 [{ id, date, items, total }]
  }),

  getters: {
    activeItems: (state) => state.items.filter((i) => !i.purchased),
    purchasedItems: (state) => state.items.filter((i) => i.purchased),
    // 本轮采购轮次（完成次数）
    purchaseRounds: (state) => state.history.length,
    // 总花费
    totalSpend: (state) => state.history.reduce((s, h) => s + Number(h.total || 0), 0),
    weeklySpend() {
      const now = new Date()
      const start = new Date(now)
      const day = now.getDay()
      start.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      start.setHours(0, 0, 0, 0)
      return this.history
        .filter((h) => new Date(h.date) >= start)
        .reduce((s, h) => s + Number(h.total || 0), 0)
    },
    // 本月采购记录
    monthlyHistory() {
      const now = new Date()
      return this.history.filter((h) => {
        const d = new Date(h.date)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
    },
    // 本月花费
    monthlySpend() {
      return this.monthlyHistory.reduce((s, h) => s + Number(h.total || 0), 0)
    },
    // 本月采购金额按类别汇总（[{ category, amount, count }]，按金额降序）
    monthlyCategorySummary() {
      const inventory = useInventoryStore()
      // 旧记录未存类别，按 名称+单位 / 名称 从当前库存反查兜底
      const byNameUnit = {}
      const byName = {}
      inventory.items.forEach((i) => {
        byNameUnit[`${i.name}|${i.unit}`] = i.category
        if (!(i.name in byName)) byName[i.name] = i.category
      })
      const map = {}
      this.monthlyHistory.forEach((h) => {
        const items = h.items || []
        items.forEach((it) => {
          const category =
            it.category || byNameUnit[`${it.name}|${it.unit}`] || byName[it.name] || '其他'
          if (!map[category]) map[category] = { category, amount: 0, count: 0 }
          map[category].amount += Number(it.price || 0)
          map[category].count += 1
        })
      })
      return Object.values(map).sort((a, b) => b.amount - a.amount)
    },
    // 缺口总额（未采购项）
    totalGap: (state) =>
      state.items.filter((i) => !i.purchased).reduce((s, i) => s + Number(i.gap || 0), 0),
  },

  actions: {
    persist() {
      write(LIST_KEY, this.items)
      write(HISTORY_KEY, this.history)
    },

    // 根据本周食谱计划与库存生成采购清单
    generate() {
      const mealPlan = useMealPlanStore()
      const inventory = useInventoryStore()
      const requirements = mealPlan.weeklyRequirements

      this.items = requirements
        .map((req) => {
          const inStock = inventory.findByRef(req)
          const available = inStock ? Number(inStock.quantity || 0) : 0
          const gap = Math.max(0, req.required - available)
          return {
            id: uid('shop'),
            name: req.name,
            unit: req.unit,
            ingredientId: req.ingredientId,
            category: inStock ? inStock.category : '其他',
            required: req.required,
            inStock: available,
            gap,
            price: 0,
            purchased: false,
            createdAt: new Date().toISOString(),
          }
        })
        .filter((i) => i.gap > 0)

      this.persist()
      return this.items
    },

    // 标记已采购并自动入库
    markPurchased(ids) {
      const inventory = useInventoryStore()
      const targets = this.items.filter((i) => ids.includes(i.id) && !i.purchased)

      targets.forEach((i) => {
        inventory.restock({
          name: i.name,
          unit: i.unit,
          quantity: i.gap,
          category: i.category || '其他',
        })
        i.purchased = true
      })

      const total = targets.reduce((s, i) => s + Number(i.price || 0), 0)
      if (targets.length) {
        this.history.unshift({
          id: uid('purchase'),
          date: new Date().toISOString(),
          items: targets.map((t) => ({
            name: t.name,
            unit: t.unit,
            quantity: t.gap,
            price: t.price,
            category: t.category || '其他',
          })),
          total,
        })
      }
      this.persist()
      return targets.length
    },

    // 全部标记已采购
    markAllPurchased() {
      const ids = this.activeItems.map((i) => i.id)
      return this.markPurchased(ids)
    },

    clearCompleted() {
      this.items = this.items.filter((i) => !i.purchased)
      this.persist()
    },

    resetList() {
      this.items = []
      this.persist()
    },
  },
})
