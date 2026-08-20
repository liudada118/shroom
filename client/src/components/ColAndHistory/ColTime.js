import React, { useEffect, useState } from 'react'
import { msToHMS } from '../../assets/util/date';

/**
 * 采集计时：从点「开始采集」那一刻起按本机时钟走。
 * 原来用设备帧的时间戳算，只要有一个部位没连上就会被「XX已断开」顶掉、看不到计时，
 * 这里不再看设备状态，采集期间就只显示走时。
 */
export default function ColTime(props) {
    const { startTime } = props
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!startTime) return undefined
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [startTime])

    if (!startTime) return <>00:00:00</>
    return <>{msToHMS(Math.max(0, now - startTime))}</>
}
