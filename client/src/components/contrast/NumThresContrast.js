import React, { useContext, useEffect, useRef, useState } from 'react'
import { isMoreMatrix } from '../../assets/util/util';
import NumThree from '../../components/three/NumThreeColorV3'
import NumThree2 from '../../components/three/NumThreeColorV4'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { pageContext } from '../../page/test/Test';
import DataPlayContrast from './DataPlayContrast';

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

    return (
        <>{isMoreMatrix(systemType) ?
            displayType.includes('back') ? <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>

                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center' }}>
                    <NumThree2 width={50} height={64} sitData={sitData} classIndex={1} />
                    <DataPlayContrast dataLength={contrast.left.length} sitData={sitData} bottom={10} width='50%' />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center' }}>
                    <NumThree2 width={50} height={64} sitData={sitData} classIndex={2} />
                    <DataPlayContrast dataLength={contrast.right.length} sitData={sitData} bottom={10} width='50%' />
                </div>
            </div> :
                <NumThree width={45} height={45} sitData={sitData} /> :
            <NumThree width={32} height={32} sitData={sitData} />}
        </>
    )
}
