import React, { useContext, useEffect, useRef, useState } from 'react'
import { isMoreMatrix } from '../../assets/util/util';
import NumThree from '../../components/three/NumThreeColorV3'
import NumThree2 from '../../components/three/NumThreeColorV4'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { pageContext } from '../../page/test/Test';
import DataPlayContrast from './DataPlayContrast';
import { systemPointConfig } from '../../util/constant';

export default function NumThresContrast(props) {
    const pageInfo = useContext(pageContext);
    // const { sitData } = props
    // const { displayType } = pageInfo
    const systemType = useEquipStore(s => s.systemType, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    const contrast = useEquipStore(s => s.contrast, shallow);
    console.log(displayType.includes('sit'))

    // const [sitData , setData] = useState([])
    const sitData = useRef({})

    // 根据 systemType 和 displayType 动态获取 width/height
    const getMatrixSize = (type) => {
        const configKey = `${systemType}-${type}`
        const config = systemPointConfig[configKey]
        if (config) return { width: config.width, height: config.height }
        // fallback to endi defaults
        return type === 'back' ? { width: 50, height: 64 } : { width: 46, height: 46 }
    }

    const backSize = getMatrixSize('back')
    const sitSize = getMatrixSize('sit')

    return (
        <>{isMoreMatrix(systemType) ?
            displayType.includes('back') ? <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>

                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center' }}>
                    <NumThree2 key={`${systemType}-back-1`} width={backSize.width} height={backSize.height} sitData={sitData} classIndex={1} />
                    <DataPlayContrast dataLength={contrast.left.length} sitData={sitData} bottom={10} width='50%' />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center' }}>
                    <NumThree2 key={`${systemType}-back-2`} width={backSize.width} height={backSize.height} sitData={sitData} classIndex={2} />
                    <DataPlayContrast dataLength={contrast.right.length} sitData={sitData} bottom={10} width='50%' />
                </div>
            </div> :
                <NumThree key={`${systemType}-sit`} width={sitSize.width} height={sitSize.height} sitData={sitData} /> :
            <NumThree width={32} height={32} sitData={sitData} />}
        </>
    )
}
