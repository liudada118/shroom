import React, { useContext, useEffect, useState } from 'react'
import { isMoreMatrix } from '../../assets/util/util';
import NumThree from '../../components/three/NumThreeColorV3'
import NumThree2 from '../../components/three/NumThreeColorV4'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { pageContext } from '../../page/test/Test';
import { systemPointConfig } from '../../util/constant';

export default function NumThres(props) {
    const pageInfo = useContext(pageContext);
    const { sitData } = props
    // const { displayType } = pageInfo
    const systemType = useEquipStore(s => s.systemType, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    console.log(displayType.includes('sit'))

    // 根据 systemType 和 displayType 动态获取 width/height
    const getMatrixSize = () => {
        if (!isMoreMatrix(systemType)) return { width: 32, height: 32 }
        const isBack = displayType.includes('back')
        const configKey = `${systemType}-${isBack ? 'back' : 'sit'}`
        const config = systemPointConfig[configKey]
        if (config) return { width: config.width, height: config.height }
        // fallback to endi defaults
        return isBack ? { width: 50, height: 64 } : { width: 46, height: 46 }
    }

    const { width, height } = getMatrixSize()
   
    return (
        <>{isMoreMatrix(systemType) ?
            displayType.includes('back') ? <NumThree2 key={`${systemType}-back`} width={width} height={height} sitData={sitData} /> :
                <NumThree key={`${systemType}-sit`} width={width} height={height} sitData={sitData} /> :
            <NumThree width={32} height={32} sitData={sitData} />}

            {/* <div style={{width : '100vw' , height : '100vh' , 
                position : 'fixed' , zIndex : 1 , 
                display : 'flex' , alignItems :'center' , justifyContent : 'center',
                top : 0 , left : 0
                }}>
                <canvas className='canvasRuler'></canvas>
            </div> */}
        </>
    )
}
