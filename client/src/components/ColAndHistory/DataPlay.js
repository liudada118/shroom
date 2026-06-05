import React from 'react';
import { withTranslation } from 'react-i18next';
import PlaybackBar from '../../library/playback/PlaybackBar';

function DataPlay(props) {
    const { t } = props;
    const { dataLength, name } = props;

    return (
        <PlaybackBar
            name={name}
            dataLength={dataLength}
            showPlayToggle
            showSpeed
            speedLabel={t('speed')}
            onHistoryClick={props.onHistoryClick}
        />
    );
}

export default withTranslation('translation')(DataPlay);
