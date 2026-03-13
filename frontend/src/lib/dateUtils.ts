// 时间格式化工具 - 统一使用东八区北京时间

/**
 * 格式化日期时间为 yyyy/mm/dd hh:mm:ss 格式（东八区北京时间）
 */
export function formatDateTime(dateStr: string | number | Date): string {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '-'

  // 转换为东八区北京时间
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  const beijingDate = new Date(utc + 3600000 * 8)

  const year = beijingDate.getFullYear()
  const month = String(beijingDate.getMonth() + 1).padStart(2, '0')
  const day = String(beijingDate.getDate()).padStart(2, '0')
  const hours = String(beijingDate.getHours()).padStart(2, '0')
  const minutes = String(beijingDate.getMinutes()).padStart(2, '0')
  const seconds = String(beijingDate.getSeconds()).padStart(2, '0')

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

/**
 * 格式化日期为 yyyy-mm-dd 格式（东八区北京时间）
 */
export function formatDate(dateStr: string | number | Date): string {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '-'

  // 转换为东八区北京时间
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  const beijingDate = new Date(utc + 3600000 * 8)

  const year = beijingDate.getFullYear()
  const month = String(beijingDate.getMonth() + 1).padStart(2, '0')
  const day = String(beijingDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 格式化时间为 hh:mm:ss 格式（东八区北京时间）
 */
export function formatTime(dateStr: string | number | Date): string {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '-'

  // 转换为东八区北京时间
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  const beijingDate = new Date(utc + 3600000 * 8)

  const hours = String(beijingDate.getHours()).padStart(2, '0')
  const minutes = String(beijingDate.getMinutes()).padStart(2, '0')
  const seconds = String(beijingDate.getSeconds()).padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}
