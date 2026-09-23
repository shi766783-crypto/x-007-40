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
    // 本月采购小结：次数、总额、按食材类别拆分
    monthlySummary() {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const inventory = useInventoryStore()

      // 历史记录可能缺类别（旧数据），优先用记录里的类别，其次按名称/单位回查库存
      const resolveCategory = (item) => {
        if (item.category) return item.category
        const stocked = inventory.items.find(
          (i) => i.name === item.name && i.unit === item.unit,
        )
        return stocked?.category || '其他'
      }

      const catMap = {}
      let count = 0
      let total = 0
      this.history
        .filter((h) => new Date(h.date) >= start)
        .forEach((h) => {
          count += 1
          ;(h.items || []).forEach((item) => {
            const cat = resolveCategory(item)
            const amount = Number(item.price || 0)
            catMap[cat] = (catMap[cat] || 0) + amount
            total += amount
          })
        })

      const categories = Object.entries(catMap)
        .map(([category, amount]) => ({
          category,
          amount,
          percent: total ? (amount / total) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount)

      return {
        month: now.getMonth() + 1,
        count,
        total,
        categories,
        topCategory: categories[0]?.category || '',
      }
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
            ingredientId: req.ingredientId || inStock?.id || null,
            category: inStock?.category || '其他',
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
