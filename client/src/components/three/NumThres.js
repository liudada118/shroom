import React, { useContext, useEffect, useState } from 'react'
import { isMoreMatrix } from '../../assets/util/util';
import NumThree from '../../components/three/NumThreeColorV3'
import NumThree2 from '../../components/three/NumThreeColorV4'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { pageContext } from '../../page/test/Test';
import { getMatrixPartFromDisplayType, systemPointConfig } from '../../util/constant';

export default function NumThres(props) {
    const pageInfo = useContext(pageContext);
    const { sitData } = props
    // const { displayType } = pageInfo
    const systemType = useEquipStore(s => s.systemType, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    const num2DZoom = useEquipStore(s => s.num2DZoom, shallow);
    const matrixPart = getMatrixPartFromDisplayType(displayType)

    // 根据 systemType 和 displayType 动态获取 width/height
    const getMatrixSize = () => {
        if (!isMoreMatrix(systemType)) return { width: 32, height: 32 }
        const configKey = `${systemType}-${matrixPart}`
        const config = systemPointConfig[configKey]
        if (config) return { width: config.width, height: config.height }
        // fallback to endi defaults
        return { width: 32, height: 32 }
    }

    const { width, height } = getMatrixSize()

    // 判断靠背是否为正方形（如 carY 32×32），正方形靠背使用与坐垫相同的 NumThree 渲染
    const isSquareBack = width === height

    return (
        <>{isMoreMatrix(systemType) ?
            matrixPart === 'back' ?
                (isSquareBack ?
                    <NumThree key={`${systemType}-back`} width={width} height={height} sitData={sitData} zoom={num2DZoom} /> :
                    <NumThree2 key={`${systemType}-back`} width={width} height={height} sitData={sitData} zoom={num2DZoom} />) :
                <NumThree key={`${systemType}-${matrixPart || 'matrix'}`} width={width} height={height} sitData={sitData} zoom={num2DZoom} /> :
            <NumThree width={32} height={32} sitData={sitData} zoom={num2DZoom} />}

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
