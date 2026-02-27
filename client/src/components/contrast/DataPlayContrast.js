import React from 'react';
import { withTranslation } from 'react-i18next';
import PlaybackBar from '../../library/playback/PlaybackBar';

function DataPlayContrast(props) {
    const { dataLength, name, bottom, width } = props;

    return (
        <PlaybackBar
            name={name}
            dataLength={dataLength}
            style={{ position: 'absolute', bottom: `${bottom}%`, width: width }}
            contentStyle={{ width: '100%' }}
        />
    );
}

export default withTranslation('translation')(DataPlayContrast);
