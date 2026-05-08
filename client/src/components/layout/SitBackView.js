import React, { useContext } from 'react'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { isMoreMatrix } from '../../assets/util/util'
import NumThreeColorV3 from '../three/NumThreeColorV3'
import NumThreeColorV4 from '../three/NumThreeColorV4'
import NumThreeColorV2 from '../three/NumThreeColorV2'
import { pageContext } from '../../page/test/Test'
import './SitBackView.scss'

/**
 * 坐垫/靠背视图
 * - 左侧：2D 数字矩阵（NumThreeColorV3/V4）
 * - 右侧：3D 热力图（同组件，不同 display 模式）
 * @param {string} viewType - 'sit' | 'back'
 * @param {React.MutableRefObject} sitData - 实时数据 ref
 */
export default function SitBackView({ viewType, sitData }) {
  const systemType = useEquipStore(s => s.systemType, shallow)
  const pageInfo = useContext(pageContext)

  // 根据 viewType 决定 displayType
  const displayType2D = viewType === 'sit' ? 'sit2D' : 'back2D'
  const displayType3D = viewType === 'sit' ? 'sit' : 'back'
  const label = viewType === 'sit' ? '坐垫' : '靠背'

  // 根据系统类型决定矩阵尺寸
  const isMore = isMoreMatrix(systemType)
  let numWidth = 32, numHeight = 32
  if (isMore) {
    if (viewType === 'back') {
      numWidth = 50; numHeight = 64
    } else {
      numWidth = 46; numHeight = 46
    }
  }

  return (
    <div className="sbv-container">
      {/* 左侧：2D 数字矩阵 */}
      <div className="sbv-panel sbv-2d">
        <div className="sbv-panel-header">
          <span className="sbv-panel-title">{label} 2D 数字矩阵</span>
          <span className="sbv-panel-badge">ADC</span>
        </div>
        <div className="sbv-panel-body">
          {isMore ? (
            viewType === 'back'
              ? <NumThreeColorV4 width={numWidth} height={numHeight} sitData={sitData} forceDisplayType={displayType2D} />
              : <NumThreeColorV3 width={numWidth} height={numHeight} sitData={sitData} forceDisplayType={displayType2D} />
          ) : (
            <NumThreeColorV3 width={32} height={32} sitData={sitData} forceDisplayType={displayType2D} />
          )}
        </div>
      </div>

      {/* 右侧：3D 热力图 */}
      <div className="sbv-panel sbv-3d">
        <div className="sbv-panel-header">
          <span className="sbv-panel-title">{label} 3D 热力图</span>
        </div>
        <div className="sbv-panel-body">
          {isMore ? (
            viewType === 'back'
              ? <NumThreeColorV4 width={numWidth} height={numHeight} sitData={sitData} forceDisplayType={displayType3D} mode="3d" />
              : <NumThreeColorV3 width={numWidth} height={numHeight} sitData={sitData} forceDisplayType={displayType3D} mode="3d" />
          ) : (
            <NumThreeColorV3 width={32} height={32} sitData={sitData} forceDisplayType={displayType3D} mode="3d" />
          )}
        </div>
      </div>
    </div>
  )
}
