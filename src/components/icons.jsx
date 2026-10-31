// Иконки: библиотека Phosphor, один вес. Имена те же, что использовали экраны.
import {
  ArrowDown, ArrowUp, Bell, Camera, CaretDown, CaretLeft, CaretRight, ChartLineUp, ChatCircleText, Check, Clock, DotsThree,
  DownloadSimple, Envelope, Eye, File, FileText, Flask, FolderSimple, Gear, Heart, House, Kanban, LinkSimple, Lock,
  MagnifyingGlass, Paperclip, PaperPlaneRight, PencilSimple, Pill, Plus, Printer, Pulse, QrCode, ShieldCheck, SignOut, Trash, Tray,
  UploadSimple, User, UsersThree, Warning, X,
} from '@phosphor-icons/react'

const MAP = {
  home: House,
  list: DotsThree,
  folder: FolderSimple,
  chart: ChartLineUp,
  chat: ChatCircleText,
  sheet: FileText,
  users: UsersThree,
  user: User,
  shield: ShieldCheck,
  plus: Plus,
  camera: Camera,
  upload: UploadSimple,
  download: DownloadSimple,
  check: Check,
  chevR: CaretRight,
  chevL: CaretLeft,
  chevD: CaretDown,
  x: X,
  search: MagnifyingGlass,
  logout: SignOut,
  pulse: Pulse,
  file: File,
  flask: Flask,
  printer: Printer,
  link: LinkSimple,
  clock: Clock,
  alert: Warning,
  send: PaperPlaneRight,
  trash: Trash,
  edit: PencilSimple,
  more: DotsThree,
  inbox: Tray,
  board: Kanban,
  settings: Gear,
  mail: Envelope,
  lock: Lock,
  eye: Eye,
  heart: Heart,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  paperclip: Paperclip,
  bell: Bell,
  pill: Pill,
  qr: QrCode,
}

export function Icon({ name, size = 20, className = '', ...p }) {
  const C = MAP[name]
  return C ? <C size={size} weight="regular" aria-hidden="true" className={`shrink-0 ${className}`} {...p} /> : null
}
