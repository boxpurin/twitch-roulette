import { useState } from 'react'
import type { Dispatch } from 'react'
import type { ItemsAction, RouletteItem } from './items'

interface ItemsProps {
  items: readonly RouletteItem[]
  dispatch: Dispatch<ItemsAction>
  disabled?: boolean
}

function ItemRow({ item, index, dispatch }: {
  item: RouletteItem
  index: number
  dispatch: Dispatch<ItemsAction>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)

  return (
    <li className="roulette-item">
      {editing ? (
        <form className="item-edit" onSubmit={event => {
          event.preventDefault()
          if (!draft.trim()) return
          dispatch({ type: 'rename', id: item.id, name: draft })
          setEditing(false)
        }}>
          <label className="item-field">
            <span>項目 {index + 1} の名前</span>
            <input autoFocus value={draft} onChange={event => setDraft(event.target.value)} required />
          </label>
          <div className="item-actions">
            <button type="submit" disabled={!draft.trim()}>保存</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>キャンセル</button>
          </div>
        </form>
      ) : (
        <>
          <span className="item-name">{item.name}</span>
          <div className="item-actions">
            <button type="button" className="secondary" aria-label={`項目 ${index + 1} を編集`} onClick={() => {
              setDraft(item.name)
              setEditing(true)
            }}>編集</button>
            <button type="button" className="secondary" aria-label={`項目 ${index + 1} を削除`} onClick={() => {
              dispatch({ type: 'remove', id: item.id })
            }}>削除</button>
          </div>
        </>
      )}
    </li>
  )
}

export default function RouletteItems({ items, dispatch, disabled = false }: ItemsProps) {
  const [name, setName] = useState('')

  return (
    <section className="roulette-items" aria-labelledby="items-heading">
      <div className="items-heading">
        <h2 id="items-heading">ルーレットの項目</h2>
        <span>{items.length} 件</span>
      </div>
      <fieldset disabled={disabled}>
        <form className="item-add" onSubmit={event => {
          event.preventDefault()
          if (!name.trim()) return
          dispatch({ type: 'add', id: crypto.randomUUID(), name })
          setName('')
        }}>
          <label className="item-field">
            <span>項目名</span>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="追加する項目の名前" required />
          </label>
          <button type="submit" disabled={!name.trim()}>項目を追加</button>
        </form>
        {items.length === 0 ? (
          <p className="items-empty">まだ項目がありません。上のフォームから追加してください。</p>
        ) : (
          <ol className="item-list">
            {items.map((item, index) => <ItemRow key={item.id} item={item} index={index} dispatch={dispatch} />)}
          </ol>
        )}
      </fieldset>
      {disabled ? <p className="caption">回転中は項目を変更できません。</p> : null}
      <p className="caption">項目はこの画面でのみ保持します。再読み込み・ログアウトするとリセットされます。</p>
    </section>
  )
}
