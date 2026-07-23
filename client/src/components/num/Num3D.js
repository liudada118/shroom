import React, { useEffect, useState, useImperativeHandle } from 'react'
import './num.css'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
var valuej1 = localStorage.getItem('carValuej') ? JSON.parse(localStorage.getItem('carValuej')) : 200,
    valueg1 = localStorage.getItem('carValueg') ? JSON.parse(localStorage.getItem('carValueg')) : 2,
    value1 = localStorage.getItem('carValue') ? JSON.parse(localStorage.getItem('carValue')) : 2,
    valuel1 = localStorage.getItem('carValuel') ? JSON.parse(localStorage.getItem('carValuel')) : 2,
    valuef1 = localStorage.getItem('carValuef') ? JSON.parse(localStorage.getItem('carValuef')) : 2,
    valuelInit1 = localStorage.getItem('carValueInit') ? JSON.parse(localStorage.getItem('carValueInit')) : 2



function jet(min, max, x) {
    let r, g, b;
    let dv;
    r = 1;
    g = 1;
    b = 1;
    if (x < min) x = min;
    if (x > max) x = max;
    dv = max - min;
    if (x < min + 0.25 * dv) {
        r = 0;
        g = (4 * (x - min)) / dv;
    } else if (x < min + 0.5 * dv) {
        r = 0;
        b = 1 + (4 * (min + 0.25 * dv - x)) / dv;
    } else if (x < min + 0.75 * dv) {
        r = (4 * (x - min - 0.5 * dv)) / dv;
        b = 0;
    } else {
        g = 1 + (4 * (min + 0.75 * dv - x)) / dv;
        b = 0;
    }
    var rgb = new Array();
    rgb[0] = parseInt(255 * r);
    rgb[1] = parseInt(255 * g);
    rgb[2] = parseInt(255 * b);
    return rgb;
}

const Num = React.memo((props) => {
    let width = 32, canvasheight = 32
    if (props.matrixName == 'carCol') {
        width = 10
        canvasheight = 9
    }
    const [data, setData] = useState(new Array(canvasheight).fill(new Array(width).fill(0)));
    const [scale, setScale] = useState(1)





    const metricStatus = useEquipStore(s => s.metricStatus, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    const systemType = useEquipStore(s => s.systemType, shallow);
    const settingValue = useEquipStore(s => s.settingValue, shallow);
    const pressureMetricMode = useEquipStore(s => s.pressureMetricMode);

    const { color, height = 1 } = settingValue

    const metricData = metricStatus?.[pressureMetricMode] || {}
    let ndata
    if (displayType == 'back3D') {
        ndata = metricData.back
    } else if (displayType == 'sit3D') {
        ndata = metricData.sit
    } else {
        ndata = metricData[systemType]
        if (!ndata) ndata = new Array(1024).fill(0)
    }
    if (!ndata) ndata = new Array(1024).fill(0)

    let Matirx = [];
    for (let i = 0; i < canvasheight; i++) {
        Matirx[i] = [];
        for (let j = 0; j < width; j++) {
            Matirx[i].push(Number(ndata[i * width + j]) || 0);
        }
    }

    // // wsPointData = a;
    // setData(a);

    function changeScale() {
        var WW = document.documentElement.clientHeight
        var scaleNum = WW / 1240
        setScale(scaleNum)
    }

    useEffect(() => {
        // var WW = document.documentElement.clientHeight
        // var scaleNum = WW / 1020
        // setScale(scaleNum)
        changeScale()




        window.addEventListener('resize', changeScale)
        return (() => {
            changeScale()
        })
    }, []);

    // const {
    //     gauss = 1, color, filter, height = 1, coherent = 1
    // } = getSettingValue()


    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#000',
                // alignItems: 'center'
            }}
        >
            <div
                className="threeBoxF"
                style={{
                    color: 'blue', transformStyle: 'preserve-3d',
                    perspective: '800px',

                }}
            >
                <div className="threeBox"
                    style={{ transform: 'rotateX(35deg)' }}
                >
                    {Matirx.map((items, indexs) => {
                        return (
                            <div key={indexs} style={{ display: 'flex' }}>
                                {items && items.length
                                    ? items.map((item, index) => {
                                        return (
                                            <div
                                                key={index}
                                                style={{
                                                    width: `${2 * scale}rem`,
                                                    fontSize: `${scale * 20 * 0.7}px`,
                                                    lineHeight: `${1.5 * scale}rem`,
                                                    transform: `translateY(${-item * 3*height}px)`,
                                                    color: `rgb(${jet(0, color, item * 5)})`,
                                                }}
                                            >
                                                {Number(item).toFixed(1)}
                                            </div>
                                        );
                                    })
                                    : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
})

export default Num
