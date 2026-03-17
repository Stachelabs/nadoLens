import { useAccountStore } from '@/store/accountStore'
import type { SurvivalMetrics } from '@/types/nado'

export function useSurvivalMetrics(): SurvivalMetrics {
  const health = useAccountStore((s) => s.health)
  const positions = useAccountStore((s) => s.positions)

  if (!health) {
    return {
      dropTolerance: 100,
      riskLevel: 'safe',
      isMaintWeightCritical: false,
      isCritical: false,
    }
  }

  const maxMaintWeight = positions.reduce((max, p) => Math.max(max, p.maint_weight), 0)

  return {
    dropTolerance: health.drop_tolerance,
    riskLevel: health.risk_level,
    isMaintWeightCritical: maxMaintWeight >= 0.95,
    isCritical: health.drop_tolerance < 10,
  }
}
