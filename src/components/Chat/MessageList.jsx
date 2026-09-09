import { ChevronDown } from '../icons';
import MessageItem from './MessageItem';
import Button from '../common/Button';

export default function MessageList({
  containerRef, onScroll, hasMore, onLoadMore, backgroundStyle,
  messages, onReact, onReply, isDM, partnerReadAt, onForwardClick, onEdit, onViewProfile,
  canPin, pinnedMessageId, onPinMessage, onUnpinMessage, onPollVote, messageTextColor,
  typing, bottomRef, showScrollBottom, onScrollToBottom,
}) {
  return (
    <>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className={`flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 hide-scrollbar ${backgroundStyle ? '' : 'bg-base-100'}`}
        style={backgroundStyle || undefined}
      >
        {hasMore && (
          <Button size="sm" pill className="bg-base-200 self-center mb-4" onClick={onLoadMore}>
            Xem tin nhắn cũ hơn
          </Button>
        )}

        <div className="flex flex-col gap-1.5">
          {messages.map((msg, idx) => {
            return (
              <MessageItem
                key={msg._id}
                message={msg}
                onReact={onReact}
                onReply={onReply}
                isGrouped={false}
                isDM={isDM}
                seenAt={isDM && idx === messages.length - 1 ? partnerReadAt : null}
                onForwardClick={onForwardClick}
                onEdit={onEdit}
                onViewProfile={onViewProfile}
                canPin={canPin}
                isPinned={pinnedMessageId === msg._id}
                onPinMessage={onPinMessage}
                onUnpinMessage={onUnpinMessage}
                onPollVote={onPollVote}
                messageTextColor={messageTextColor}
              />
            );
          })}
        </div>

        {typing.length > 0 && (
          <p className="text-[11px] text-base-content/40 italic mt-1 px-4">
            💬 {typing.join(', ')} đang nhập...
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {showScrollBottom && (
        <Button
          onClick={onScrollToBottom}
          size="sm" circle className="!bg-base-100 border-base-300 shadow-md absolute bottom-20 right-6 hover:!text-primary z-20 animate-bounce"
          title="Cuộn xuống dưới"
        >
          <ChevronDown className="w-5 h-5" />
        </Button>
      )}
    </>
  );
}
