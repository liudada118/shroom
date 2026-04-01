import React, { useEffect, useState } from 'react';
import { message, Popover, Slider } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { shallow } from 'zustand/shallow';
import { useEquipStore } from '../../store/equipStore';
import { localAddress } from '../../util/constant';
import PlaybackSpeedMenu from './PlaybackSpeedMenu';
import PlaybackPlayToggle from './PlaybackPlayToggle';

export default function PlaybackBar(props) {
    const {
        name,
        dataLength = 0,
        showPlayToggle = false,
        showSpeed = false,
        showHistory = false,
        speedLabel = 'speed',
        historyLabel = 'history',
        style,
        contentStyle,
        onHistoryClick,
    } = props;

    const history = useEquipStore((s) => s.history, shallow);
    const [dataPlay, setDataPlay] = useState(true);
    const [speed, setSpeed] = useState('1.0');

    useEffect(() => {
        if (typeof dataLength === 'number' && dataLength > 0 && dataLength - 1 === history.index) {
            setDataPlay(true);
        }
    }, [dataLength, history.index]);

    const maxIndex = Math.max(0, (Number(dataLength) || 0) - 1);

    const handleSliderChange = (index) => {
        if ((Number(dataLength) || 0) <= 0) {
            message.error('No playback data found for the selected time');
            return;
        }

        axios({
            method: 'post',
            url: `${localAddress}/getDbHistoryIndex`,
            data: {
                index,
            },
        })
            .then((res) => {
                if (res.data?.code !== 0) {
                    message.error(res.data?.message || 'Load playback frame failed');
                } else {
                    const history = useEquipStore.getState().history;
                    const obj = { ...history, index };
                    useEquipStore.getState().setHistoryStatus(obj);
                }
            })
            .catch(() => {});
    };

    const handlePlay = () => {
        if ((Number(dataLength) || 0) <= 0) {
            message.error('No playback data found for the selected time');
            return;
        }

        axios({
            method: 'post',
            url: `${localAddress}/getDbHistoryPlay`,
        })
            .then((res) => {
                if (res.data?.code !== 0) {
                    message.error(res.data?.message || 'Playback start failed');
                    return;
                }
                setDataPlay(false);
            })
            .catch(() => {});
    };

    const handleStop = () => {
        axios({
            method: 'post',
            url: `${localAddress}/getDbHistoryStop`,
        })
            .then(() => {
                setDataPlay(true);
            })
            .catch(() => {});
    };

    const handleSpeedChange = (nextSpeed) => {
        setSpeed(nextSpeed);
        axios({
            method: 'post',
            url: `${localAddress}/changeDbplaySpeed`,
            data: {
                speed: Number(nextSpeed),
            },
        }).catch(() => {});
    };

    return (
        <div style={style}>
            <div className="colDate">{name}</div>
            <div className="playContent" style={contentStyle}>
                <Slider defaultValue={0} value={history?.index} onChange={handleSliderChange} max={maxIndex} />
                <div className="playControl">
                    <div className="playLeftContent">
                        {showPlayToggle ? (
                            <PlaybackPlayToggle isPaused={dataPlay} onPlay={handlePlay} onStop={handleStop} />
                        ) : null}
                        <div className="playStamp">
                            {history.timestamp ? dayjs(history.timestamp).format('YYYY-MM-DD HH:mm:ss') : ''}
                        </div>
                    </div>

                    {showSpeed || showHistory ? (
                        <div className="playRightContent">
                            {showSpeed ? (
                                <div className="playSpeed cursor">
                                    <Popover
                                        color="#202327"
                                        className="set-popover"
                                        placement="top"
                                        content={<PlaybackSpeedMenu value={speed} onChange={handleSpeedChange} />}
                                    >
                                        <>{speed === '1.0' ? speedLabel : `${speed}X`}</>
                                    </Popover>
                                </div>
                            ) : null}

                            {showHistory ? (
                                <div className="playHistoryData cursor" onClick={onHistoryClick}>
                                    {historyLabel}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
