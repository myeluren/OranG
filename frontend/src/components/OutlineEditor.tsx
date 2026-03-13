'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// 类型定义
interface OutlineNode {
  id: string
  level: number
  title: string
  children: OutlineNode[]
}

interface Props {
  value: OutlineNode[]
  onChange: (value: OutlineNode[]) => void
}

// 生成固定序号标签
const generateLevelLabel = (level: number, index: number, parentLabel?: string): string => {
  if (level === 1) {
    const labels = ['', '第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '第九章', '第十章']
    return labels[index + 1] || `第${index + 1}章`
  } else if (level === 2) {
    return parentLabel ? `${parentLabel}.${index + 1}` : `${index + 1}`
  } else if (level === 3) {
    return parentLabel ? `${parentLabel}.${index + 1}` : `${index + 1}`
  }
  return `${index + 1}`
}

// 获取节点及其所有子节点的ID列表
const getNodeAndDescendantsIds = (node: OutlineNode): string[] => {
  const ids: string[] = [node.id]
  if (node.children) {
    node.children.forEach(child => {
      ids.push(...getNodeAndDescendantsIds(child))
    })
  }
  return ids
}

// 查找节点
const findNode = (nodes: OutlineNode[], id: string): OutlineNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

// 查找父节点
const findParent = (nodes: OutlineNode[], id: string, parent: OutlineNode[] = nodes): { parent: OutlineNode[]; index: number } | null => {
  for (let i = 0; i < parent.length; i++) {
    if (parent[i].id === id) {
      return { parent, index: i }
    }
    if (parent[i].children) {
      const found = findParent(nodes, id, parent[i].children!)
      if (found) return found
    }
  }
  return null
}

// 生成唯一ID
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// 展平所有节点（用于渲染）
interface FlattenedItem {
  id: string
  node: OutlineNode
  label: string
}

const flattenForRender = (nodes: OutlineNode[], parentLabel?: string, parentLevel = 0): FlattenedItem[] => {
  const result: FlattenedItem[] = []
  nodes.forEach((node, index) => {
    // 如果没有level字段，根据父层级推断
    const level = node.level || parentLevel + 1
    const label = generateLevelLabel(level, index, parentLabel)
    result.push({ id: node.id, node: { ...node, level }, label })
    if (node.children && node.children.length > 0) {
      result.push(...flattenForRender(node.children, label, level))
    }
  })
  return result
}

// 可排序的章节行
function SortableRow({
  id,
  node,
  label,
  onDelete,
  onAddChild,
  draggedIds,
}: {
  id: string
  node: OutlineNode
  label: string
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
  draggedIds: string[]
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : draggedIds.includes(id) ? 0.3 : 1,
  }

  const isDraggingGroup = isDragging || draggedIds.includes(id)

  return (
    <div ref={setNodeRef} style={style} className="flex items-center h-10">
      {/* 拖拽手柄 */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 mr-2"
        title="拖拽调整顺序"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </button>

      {/* 标题内容 */}
      <div className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
        node.level === 1 ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' :
        node.level === 2 ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' :
        'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      } ${isDraggingGroup ? 'shadow-md' : ''}`}>
        <span className="flex-1 text-sm truncate">{node.title}</span>

        {/* 操作按钮 */}
        <div className="flex gap-1 shrink-0">
          {node.level < 3 && (
            <button
              onClick={() => onAddChild(id)}
              className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
              title="添加子章节"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(id)}
            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="删除"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// 拖拽时的覆盖层
function DragOverlayRow({ node, label }: { node: OutlineNode; label: string }) {
  return (
    <div className="flex items-center h-10">
      <div className="w-6 mr-2"></div>
      <div className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-lg ${
        node.level === 1 ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' :
        node.level === 2 ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' :
        'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      }`}>
        <span className="flex-1 text-sm truncate">{node.title}</span>
      </div>
    </div>
  )
}

// 主组件
export default function OutlineEditor({ value, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // 当前正在拖拽的节点ID列表（包括拖拽节点及其所有子节点）
  const [draggedIds, setDraggedIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  // 展平所有节点
  const flattenedItems = useMemo(() => flattenForRender(value), [value])

  // 获取所有可排序的ID
  const sortableIds = useMemo(() => flattenedItems.map(item => item.id), [flattenedItems])

  // 查找父节点标签
  const findParentLabel = (id: string): string | undefined => {
    for (const item of flattenedItems) {
      if (item.node.children?.some(c => c.id === id)) {
        return item.label
      }
    }
    return undefined
  }

  // 删除节点
  const handleDelete = (id: string) => {
    const deleteNode = (items: OutlineNode[]): OutlineNode[] => {
      return items
        .filter((item) => item.id !== id)
        .map((item) => ({
          ...item,
          children: item.children ? deleteNode(item.children) : [],
        }))
        .filter((item) => item.title || item.children.length)
    }
    onChange(deleteNode(value))
  }

  // 添加子章节
  const handleAddChild = (parentId: string) => {
    const addChild = (items: OutlineNode[]): OutlineNode[] => {
      return items.map((item) => {
        if (item.id === parentId) {
          const newChild: OutlineNode = {
            id: generateId(),
            level: item.level + 1,
            title: '新章节',
            children: [],
          }
          return {
            ...item,
            children: [...(item.children || []), newChild],
          }
        }
        if (item.children && item.children.length > 0) {
          return { ...item, children: addChild(item.children) }
        }
        return item
      })
    }
    onChange(addChild(value))
  }

  // 添加一级章节
  const handleAddRoot = () => {
    const newNode: OutlineNode = {
      id: generateId(),
      level: 1,
      title: `第${value.length + 1}章`,
      children: [],
    }
    onChange([...value, newNode])
  }

  // 拖拽开始
  const handleDragStart = (event: { active: { id: string | number } }) => {
    const id = event.active.id as string
    const node = findNode(value, id)
    if (node) {
      const allIds = getNodeAndDescendantsIds(node)
      setDraggedIds(allIds)
      setActiveId(id)
    }
  }

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      setDraggedIds([])
      setActiveId(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    // 如果拖拽的是二级节点，需要把它的所有三级子节点也包含在移动中
    const activeNode = findNode(value, activeId)
    if (!activeNode) {
      setDraggedIds([])
      setActiveId(null)
      return
    }

    // 获取拖拽的节点及其所有子节点
    const movingIds = getNodeAndDescendantsIds(activeNode)

    // 找到目标位置
    const overParent = findParent(value, overId)
    const activeParent = findParent(value, activeId)

    if (!overParent) {
      setDraggedIds([])
      setActiveId(null)
      return
    }

    // 如果在同一父节点下移动
    if (activeParent && activeParent.parent === overParent.parent) {
      const oldIndex = activeParent.index
      const newIndex = overParent.index

      if (oldIndex !== newIndex) {
        const newChildren = [...activeParent.parent]
        const [removed] = newChildren.splice(oldIndex, 1)
        newChildren.splice(newIndex, 0, removed)

        // 更新树结构
        const updateParentChildren = (items: OutlineNode[]): OutlineNode[] => {
          return items.map(item => {
            if (item.children && item.children.some(c => movingIds.includes(c.id))) {
              return { ...item, children: newChildren }
            }
            if (item.children) {
              return { ...item, children: updateParentChildren(item.children) }
            }
            return item
          })
        }
        onChange(updateParentChildren(value))
      }
    } else {
      // 跨层级移动 - 需要先把节点从原位置移除，再添加到新位置
      const removeNodes = (items: OutlineNode[]): OutlineNode[] => {
        return items
          .filter(item => !movingIds.includes(item.id))
          .map(item => ({
            ...item,
            children: item.children ? removeNodes(item.children) : [],
          }))
          .filter(item => item.title || item.children.length)
      }

      let newValue = removeNodes(value)

      // 找到目标父节点并添加
      const targetParent = findParent(newValue, overId)
      if (targetParent) {
        const insertIndex = targetParent.index + 1
        const movedNode = { ...activeNode }

        targetParent.parent.splice(insertIndex, 0, movedNode)
      }

      onChange(newValue)
    }

    setDraggedIds([])
    setActiveId(null)
  }

  // 获取活动拖拽节点
  const activeNode = activeId ? findNode(value, activeId) : null

  return (
    <div className="outline-editor flex flex-col h-full">
      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          大纲结构（拖拽调整顺序）
        </h3>
        <button
          onClick={handleAddRoot}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加章节
        </button>
      </div>

      {value.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          暂无大纲，请先上传招标文件生成大纲
        </div>
      ) : (
        <div className="flex h-full">
          {/* 左侧固定序号栏 */}
          <div className="w-20 shrink-0 border-r border-gray-200 dark:border-gray-700 pr-2 mr-2 overflow-y-auto scrollbar-hide">
            <div className="text-xs text-gray-400 mb-2 px-1 sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">序号</div>
            {flattenedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center h-10"
              >
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  item.node.level === 1 ? 'bg-blue-500 text-white' :
                  item.node.level === 2 ? 'bg-green-500 text-white' :
                  'bg-gray-500 text-white'
                }`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {flattenedItems.map((item) => (
                  <SortableRow
                    key={item.id}
                    id={item.id}
                    node={item.node}
                    label={item.label}
                    onDelete={handleDelete}
                    onAddChild={handleAddChild}
                    draggedIds={draggedIds}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeNode ? (
                  <DragOverlayRow node={activeNode} label={activeNode.title} />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      {value.length > 0 && (
        <div className="mt-4 pt-4 border-t text-sm text-gray-500 dark:text-gray-400">
          共 {flattenedItems.length} 个章节
        </div>
      )}
    </div>
  )
}
