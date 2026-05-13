import { ConversationList } from '../components/chat/ConversationList'
import { ChatWindow } from '../components/chat/ChatWindow'
import { VisitorInfoPanel } from '../components/chat/VisitorInfoPanel'

export default function Inbox() {
  return (
    <>
      <ConversationList />
      <ChatWindow />
      <VisitorInfoPanel />
    </>
  )
}
