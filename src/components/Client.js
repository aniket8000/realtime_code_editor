import React from 'react';
import Avatar from 'react-avatar';

const Client = ({username, onKick}) => {
    return (
        <div className="client">
            <Avatar name={username} size={50} round="14px" />
            <span className="userName">{username}</span>
            {onKick && (
                <button className="kickBtn" onClick={onKick} title="Remove from room">
                    ✕
                </button>
            )}
        </div>
    );
};

export default Client;