import React from 'react';

export default function PlaybackPlayToggle({ isPaused, onPlay, onStop }) {
    return (
        <div className="playOrStop">
            {isPaused ? (
                <i className="iconfont cursor" onClick={onPlay}>
                    &#xe634;
                </i>
            ) : (
                <i className="iconfont cursor" onClick={onStop}>
                    &#xe635;
                </i>
            )}
        </div>
    );
}
