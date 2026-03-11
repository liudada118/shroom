import { Input, message, Popover } from 'antd'
import React, { useContext, useEffect, useState } from 'react'
import { getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { colSelectMatrix } from '../../util/util'
import { systemPointConfig } from '../../util/constant'
import { pageContext } from '../../page/test/Test'
import { isMoreMatrix } from '../../assets/util/util'
import { calMatrixToSelect } from '../../assets/util/selectMatrix'
const selectInputObj = [
    {
        name: 'X',
        placeholder: '输入初始横向起点',
        valueStr: 'xStart'
    }, {
        name: 'Y',
        placeholder: '输入初始纵向起点',
        valueStr: 'yStart'
    }, {
        name: '长',
        placeholder: '输入框选横向点数',
        valueStr: 'width'
    }, {
        name: '宽',
        placeholder: '输入框选纵向点数',
        valueStr: 'height'
    },
]

const selectInfo = <div style={{ width: '10rem', color: '#fff' }}>
    <div>X: 输入初始横向起点</div>
    <div>Y: 输入初始纵向起点</div>
    <div>长: 输入框选横向点数</div>
    <div>宽: 输入框选纵向点数</div>
    <div>注意: x加长不能超过横向传感点数(60个),y加宽不能超过纵向传感点数(50个)</div>
</div>

export default function SelectSet(props) {
    const { onSelect } = props


    const pageInfo = useContext(pageContext);
    const { displayType } = pageInfo
    let type






    const [rect, setRect] = useState({});

    const [matrixInfo, setMatrixInfo] = useState({})

    const [sysType, setSysType] = useState('')


    useEffect(() => {
        const systemType = getSysType()
        if (isMoreMatrix(systemType)) {
            type = systemType + '-' + (displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : '')
        } else {
            type = systemType
        }
        setSysType(type)
        console.log(type, systemType, '-----------')

        const { width, height } = systemPointConfig[type]
        const matrixConfig = { width, height }
        setMatrixInfo(matrixConfig)


        const cb = (range) => {

            // setRect(range);

            setRect((prev) => {
                // 基于上一次状态更新
                console.log(range[0])
                const matrix = colSelectMatrix('canvasThree', range[0], systemPointConfig[type])
                const obj = {}
                obj.xStart = matrix.xStart
                obj.xEnd = matrix.xEnd
                obj.yStart = matrix.yStart
                obj.yEnd = matrix.yEnd
                obj.width = obj.xEnd - obj.xStart
                obj.height = obj.yEnd - obj.yStart
                console.log(obj)
                return { ...obj };
            });
        }


        pageInfo.brushInstance.subscribe(cb);

        return () => {
            pageInfo.brushInstance.unsubscribe(cb);
        };
    }, [pageInfo.brushInstance])
    // console.log(rect, 'rect')

    const selectInfo = <div style={{ width: '10rem', color: '#fff' }}>
        <div>X: 输入初始横向起点</div>
        <div>Y: 输入初始纵向起点</div>
        <div>长: 输入框选横向点数</div>
        <div>宽: 输入框选纵向点数</div>
        <div>注意: x加长不能超过横向传感点数({matrixInfo.width ? matrixInfo.width : 32}个),y加宽不能超过纵向传感点数({matrixInfo.height ? matrixInfo.height : 32}个)</div>
    </div>

    return <>  {onSelect ? <div className='selectInputContent'>
        <div className="selectInputTitle"> <div className="selectInputTitleInfo">框选区域</div>
            <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={selectInfo} >
                <i className='iconfont cursor'>&#xe674;</i> </Popover>
        </div>
        {
            selectInputObj.map((a => {
                return <div className='selectInputItem'>
                    <div className="selectInputItemName">{a.name}:</div> <Input value={rect[a.valueStr]} onChange={(e) => {
                        // setRect
                        const obj = { ...rect }
                        obj[a.valueStr] = Number(e.target.value)
                        setRect(obj)

                    }} className='selectInput' style={{width : '5rem', backgroundColor: '#202327', border: 0, color: "#E6EBF0", }} placeholder={a.placeholder} />
                </div>
            }))
        }
        <div className="selectInputButtonContent">
            <div className="selectInputButton connectButton cursor"
                onClick={() => {

                    if(rect.xStart < 0 || rect.yStart < 0){
                        message.error('初始坐标需要大于0')
                        return
                    }

                    if (rect.xStart + rect.width > systemPointConfig[sysType].width) {
                        message.error('初始横坐标加长不能超过横向传感点数(50个)')
                        return
                    }

                    if (rect.yStart + rect.height > systemPointConfig[sysType].height) {
                        message.error('初始纵坐标加宽不能超过横向传感点数(50个)')
                        return
                    }
                    const selectInfo = calMatrixToSelect('canvasThree', { xStart: rect.xStart, yStart: rect.yStart, sWidth: rect.width, sHeight: rect.height }, systemPointConfig[sysType])
                    const { selectWidth, selectHeight, selectX, selectY } = selectInfo
                    const selectBox = document.querySelector('.selectBox')
                    selectBox.style.left = selectX + 'px';
                    selectBox.style.top = selectY + 'px';
                    selectBox.style.width = `${selectWidth}px`;
                    selectBox.style.height = `${selectHeight}px`;

                    const obj = {
                        bgc: "#0066ff",
                        index: 20,
                        x1: selectX,
                        x2: selectX + selectWidth,
                        y1: selectY,
                        y2: selectY + selectHeight
                    }

                    pageInfo.brushInstance.notify([obj]);

                    console.log(rect, selectInfo)
                }}
            >确认</div>

            {/* {Object.values(rect).map((a) => a)} */}
        </div>
    </div> : ''}</>

}
