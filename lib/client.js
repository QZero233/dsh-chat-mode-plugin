window.__ModuleLoader__.load({
	id: "dsh-plugin-chat-mode",
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

		const React = require("react")

		const CSS = [
			'.cm-chip{height:24px;padding:0 9px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:color .15s,border-color .15s,background .15s;}',
			'.cm-chip:hover{background:var(--dsw-alias-bg-layer-2);}',
			'.cm-chip[data-on="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
			'.cm-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary);opacity:.5;}',
			'.cm-chip[data-on="true"] .cm-dot{background:var(--dsw-alias-brand-primary);opacity:1;}',
			'.cm-bubbles{display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;}',
			'.cm-bubble{max-width:100%;padding:8px 12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:break-word;animation:cm-pop .18s ease-out;}',
			'@keyframes cm-pop{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}',
			'.cm-wrap{display:flex;flex-direction:column;gap:6px;width:100%;}',
			'.cm-text{color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;}',
			'.cm-code{margin:0;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;overflow-x:auto;}',
			'.cm-reason{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6;border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px;white-space:pre-wrap;word-break:break-word;}',
			'.cm-typing{display:inline-flex;gap:4px;padding:4px 0;}',
			'.cm-typing i{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary);opacity:.45;animation:cm-blink 1.1s infinite;}',
			'.cm-typing i:nth-child(2){animation-delay:.18s;}',
			'.cm-typing i:nth-child(3){animation-delay:.36s;}',
			'@keyframes cm-blink{0%,60%,100%{opacity:.2;}30%{opacity:.75;}}',
			'.cm-empty{color:var(--dsw-alias-state-warn-primary);font-size:12px;opacity:.8;line-height:1.6;}',
		].join('\n')

		const CSS_TAG_ID = 'dsh-plugin-chat-mode/client.css'

		function injectCss() {
			if (typeof document === 'undefined') return
			if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') !== null) return
			const tag = document.createElement('style')
			tag.dataset.plugin = 'dsh-plugin-chat-mode'
			tag.dataset.pluginCss = CSS_TAG_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		const MAX_RENDER_LINES = 24
		const MAX_RENDER_LINE_CHARS = 140
		const CHAT_COMMAND = 'chat'

		function revealDelayMs(count) {
			if (count > 12) return 240
			if (count > 5) return 320
			return 420
		}

		// ── chat-mode state, folded from the conversation snapshot ──────────
		// `snapshot.chat.nodes` is a ChatNodeStore (values()), whose entries are
		// wrappers carrying `.data`; the legacy top-level `snapshot.nodes` array
		// carries CommandNode fields directly. Both shapes are handled.

		function foldChatMode(snapshot) {
			let known = false
			let on = false
			let bestSeq = -1

			function consider(name, args, seq) {
				if (name !== CHAT_COMMAND) return
				known = true
				const rank = typeof seq === 'number' ? seq : 0
				if (rank < bestSeq) return
				bestSeq = rank
				const value = typeof args === 'string' ? args.trim().toLowerCase() : ''
				if (value === 'on') on = true
				else if (value === 'off') on = false
			}

			if (snapshot === null || typeof snapshot !== 'object') return { known: false, on: false }

			const chat = snapshot.chat
			if (chat !== null && typeof chat === 'object' && chat.nodes !== null && typeof chat.nodes === 'object' && typeof chat.nodes.values === 'function') {
				let entries = []
				try {
					entries = chat.nodes.values()
				} catch (error) {
					entries = []
				}
				for (const entry of entries) {
					if (entry === null || typeof entry !== 'object') continue
					const data = entry.data
					if (data === null || typeof data !== 'object') continue
					consider(data.name, data.args, data.seq)
				}
			}

			const legacy = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
			for (const node of legacy) {
				if (node === null || typeof node !== 'object') continue
				if (node.kind !== 'command') continue
				consider(node.name, node.args, node.seq)
			}

			return { known, on }
		}

		function stripFence(text) {
			const trimmed = text.trim()
			const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(trimmed)
			if (fenced !== null) return fenced[1].trim()
			return trimmed
		}

		function splitMessages(text) {
			if (typeof text !== 'string') return null
			const body = stripFence(text)
			if (body === '') return null
			const lines = []
			for (const part of body.split(/\r?\n/)) {
				const line = part.trim()
				if (line !== '') lines.push(line)
			}
			if (lines.length === 0) return null
			if (lines.length > MAX_RENDER_LINES) return null
			for (const line of lines) {
				if (line.length > MAX_RENDER_LINE_CHARS) return null
				if (line.indexOf('```') >= 0) return null
			}
			return lines
		}

		function collectText(blocks) {
			const parts = []
			for (const block of blocks) {
				if (block === undefined || block === null) continue
				if (block.kind === 'text' && typeof block.text === 'string' && block.text !== '') parts.push(block.text)
			}
			return parts.join('\n')
		}

		const inject = ['slots', 'timer', 'remote', 'remote.commands']

		function apply(ctx) {
			const slots = ctx.get('slots')
			if (slots === undefined) {
				console.error('[chat-mode] client: slots 服务不可用，UI 未注册')
				return
			}
			injectCss()

			// Components live inside apply so they close over the live context: a
			// slot component receives SLOT props only, never plugin-supplied props,
			// so timers must come from this closure rather than from props.
			const timeout = function (callback, delay) {
				return ctx.timeout(callback, delay)
			}

			const sessionState = new Map()
			let overrideDispose
			let overrideWanted = false

			function TypingDots() {
				return React.createElement('span', { className: 'cm-typing' },
					React.createElement('i', null),
					React.createElement('i', null),
					React.createElement('i', null))
			}

			function ChatBubbles(props) {
				const lines = props.lines
				const count = lines.length
				const signature = lines.join('\u0001')
				const shownPair = React.useState(count <= 1 ? count : 1)
				const shown = shownPair[0]
				const setShown = shownPair[1]

				React.useEffect(function () {
					if (count <= 1) {
						setShown(count)
						return undefined
					}
					setShown(1)
					const delay = revealDelayMs(count)
					let cancelled = false
					let current = 1
					let pending
					const step = function () {
						if (cancelled) return
						if (current >= count) return
						pending = timeout(function () {
							if (cancelled) return
							current += 1
							setShown(current)
							step()
						}, delay)
					}
					step()
					return function () {
						cancelled = true
						if (pending !== undefined) pending()
					}
				}, [signature, count])

				const nodes = []
				const limit = shown < count ? shown : count
				for (let index = 0; index < limit; index += 1) {
					nodes.push(React.createElement('div', { className: 'cm-bubble', key: 'b' + index }, lines[index]))
				}
				return React.createElement('div', { className: 'cm-bubbles' }, nodes)
			}

			function renderRichText(text, prefix, into) {
				const parts = text.split(/```/)
				for (let index = 0; index < parts.length; index += 1) {
					const part = parts[index]
					if (part === '') continue
					if (index % 2 === 1) {
						into.push(React.createElement('pre', { className: 'cm-code', key: prefix + 'c' + index }, part.replace(/^[a-zA-Z0-9_-]*\n/, '').replace(/\s+$/, '')))
					} else {
						into.push(React.createElement('div', { className: 'cm-text', key: prefix + 't' + index }, part.replace(/^\n+/, '').replace(/\n+$/, '')))
					}
				}
			}

			function PlainFallback(props) {
				const blocks = props.blocks
				const nodes = []
				for (let index = 0; index < blocks.length; index += 1) {
					const block = blocks[index]
					if (block === undefined || block === null) continue
					if (block.kind === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
						renderRichText(block.text, 'x' + index + '-', nodes)
					} else if (block.kind === 'reasoning' && typeof block.text === 'string' && block.text.trim() !== '') {
						nodes.push(React.createElement('div', { className: 'cm-reason', key: 'r' + index }, block.text.trim().slice(0, 160)))
					}
				}
				if (nodes.length === 0) {
					if (props.streaming) return React.createElement('div', { className: 'cm-wrap' }, React.createElement(TypingDots, null))
					return null
				}
				return React.createElement('div', { className: 'cm-wrap' }, nodes)
			}

			function AssistantStepRenderer(props) {
				const node = props.node
				const data = node === undefined || node === null ? undefined : node.data
				if (data === undefined || data === null) {
					const keys = Object.keys(props).join(',')
					return React.createElement('div', { className: 'cm-empty' }, '[chat-mode] 未取到消息节点。props: ' + keys)
				}
				const blocks = Array.isArray(data.blocks) ? data.blocks : []
				const streaming = data.status === 'running'
				const text = collectText(blocks)
				const lines = splitMessages(text)
				if (lines !== null) return React.createElement(ChatBubbles, { key: 'bubbles', lines: lines })
				if (streaming && text.trim() === '') {
					return React.createElement('div', { className: 'cm-wrap' }, React.createElement(TypingDots, null))
				}
				return React.createElement(PlainFallback, { key: 'plain', blocks: blocks, streaming: streaming })
			}

			function syncOverride() {
				let want = false
				for (const value of sessionState.values()) {
					if (value === true) {
						want = true
						break
					}
				}
				if (want === overrideWanted) return
				overrideWanted = want
				if (want) {
					try {
						overrideDispose = slots.inject('conversation.chat.node', function () {
							return slots.register({ name: 'conversation.chat.node', key: 'assistant-step', priority: -1 }, AssistantStepRenderer)
						})
						console.log('[chat-mode] client: assistant-step 覆盖已注册（priority -1）')
					} catch (error) {
						console.error('[chat-mode] client: assistant-step 覆盖注册失败 ' + (error !== null && error !== undefined && typeof error.message === 'string' ? error.message : String(error)))
						overrideWanted = false
					}
					return
				}
				if (overrideDispose !== undefined) {
					console.log('[chat-mode] client: 卸载 assistant-step 渲染器覆盖')
					overrideDispose()
					overrideDispose = undefined
				}
			}

			function observe(sid, on) {
				if (sessionState.get(sid) === on) return
				sessionState.set(sid, on)
				ctx.timeout(syncOverride, 0)
			}

			function runCommand(sessionId, line) {
				let pending
				try {
					pending = ctx.remote.commands.execute(sessionId, line)
				} catch (error) {
					console.error('[chat-mode] client: 命令调用失败 ' + String(error && error.message))
					return Promise.resolve(false)
				}
				return Promise.resolve(pending).then(function (result) {
					if (result === null || typeof result !== 'object') return false
					if (result.ok === true) return true
					console.error('[chat-mode] client: 命令返回失败 ' + String(result.error && result.error.message))
					return false
				}).catch(function (error) {
					console.error('[chat-mode] client: 命令异常 ' + String(error && error.message))
					return false
				})
			}

			function ChatModeChip(props) {
				const sessionId = props.sessionId
				const sid = String(sessionId === undefined ? '' : sessionId)
				const folded = foldChatMode(props.session)
				const localPair = React.useState(null)
				const local = localPair[0]
				const setLocal = localPair[1]
				const probedPair = React.useState(false)
				const probed = probedPair[0]
				const setProbed = probedPair[1]

				const on = local === null ? folded.on : local

				React.useEffect(function () {
					observe(sid, on)
				}, [sid, on])

				// One authoritative probe per session while the snapshot still shows
				// no /chat command: a bare /chat reports state and changes nothing.
				React.useEffect(function () {
					if (probed || folded.known) return
					setProbed(true)
					runCommand(sessionId, '/chat')
				}, [probed, folded.known, sessionId])

				const toggle = function () {
					const next = !on
					setLocal(next)
					runCommand(sessionId, '/chat ' + (next ? 'on' : 'off')).then(function (ok) {
						if (!ok) setLocal(null)
					})
				}

				return React.createElement('button', {
					type: 'button',
					className: 'cm-chip',
					'data-on': on ? 'true' : 'false',
					title: on ? '聊天模式已开启：逐行分条 + 输出前结构检查与模型审查。点击关闭' : '开启聊天模式：逐行分条 + 输出前结构检查与模型审查',
					onClick: toggle,
				},
					React.createElement('span', { className: 'cm-dot' }),
					React.createElement('span', null, '聊天模式'))
			}

			slots.inject('conversation.input.left', function () {
				return slots.register({ name: 'conversation.input.left', id: 'chatmode-toggle', order: 30 }, ChatModeChip)
			})
			console.log('[chat-mode] client: 已就绪（开关 + 按行分条渲染器待命）')
		}

		exports.apply = apply
		exports.inject = inject
		return module.exports
	}
})
