// main.ts

import { App, Plugin, Modal } from "obsidian";

// ======================================================
// 1. 插件主类 (Plugin Entry Point)
// ======================================================
export default class ImageToolkitPlugin extends Plugin {
	async onload() {
		// 注册一个全局的 DOM 点击事件监听器
		// 当用户点击文档中的任何元素时，此函数都会触发
		// 我们使用捕获阶段(capture: true)以确保能优先处理点击事件
		this.registerDomEvent(
			document,
			"click",
			(evt: MouseEvent) => {
				// 获取被点击的 HTML 元素
				const target = evt.target as HTMLElement;

				// 检查被点击的元素是否是图片 (<img> 标签)
				if (target.tagName === "IMG") {
					// 阻止 Obsidian 默认的图片点击行为
					evt.preventDefault();
					evt.stopPropagation();

					// 获取图片的 URL (src)
					const src = target.getAttribute("src");
					if (src) {
						// 如果 src 有效，则创建并打开我们的自定义预览窗口
						new ImagePreviewModal(this.app, src).open();
					}
				}
			},
			{ capture: true }
		);
	}

	onunload() {
		// 插件卸载时，Obsidian 会自动清理 registerDomEvent 注册的事件，
		// 所以这里通常不需要写额外的清理代码。
	}
}

// ======================================================
// 2. 自定义图片预览模态框 (The Modal)
// ======================================================
class ImagePreviewModal extends Modal {
	// --- 属性定义 ---
	private imgSrc: string;
	private imgElement: HTMLImageElement; // 用于存储图片DOM元素，方便重复操作

	// --- 图片状态变量 ---
	private currentRotation = 0; // 当前旋转角度
	private currentScale = 1; // 当前缩放比例
	private scaleX = 1; // 水平翻转状态 (1: 正常, -1: 翻转)
	private scaleY = 1; // 垂直翻转状态 (1: 正常, -1: 翻转)
	private isGrayscale = false; // 是否为灰度模式

	constructor(app: App, imgSrc: string) {
		super(app);
		this.imgSrc = imgSrc;
	}

	// --- Modal 打开时执行的核心逻辑 ---
	onOpen() {
		const { contentEl } = this;
		contentEl.empty(); // 清空 Modal 的默认内容
		contentEl.addClass("image-toolkit-modal-content"); // 添加自定义CSS类

		// 创建一个容器用于包裹图片，方便实现居中和溢出隐藏
		const container = contentEl.createDiv({ cls: "image-container" });
		this.imgElement = container.createEl("img", {
			attr: { src: this.imgSrc },
		});
		this.imgElement.addClass("preview-image");

		// 创建工具栏
		const toolbar = contentEl.createDiv({ cls: "image-toolkit-toolbar" });

		// --- 创建所有操作按钮 ---
		// 放大
		this.createButton(toolbar, "➕", "Zoom In", () => {
			this.currentScale += 0.1;
			this.applyTransformations();
		});

		// 缩小
		this.createButton(toolbar, "➖", "Zoom Out", () => {
			// 防止缩得太小
			this.currentScale = Math.max(0.1, this.currentScale - 0.1);
			this.applyTransformations();
		});

		// 向右旋转
		this.createButton(toolbar, "⟳", "Rotate Right", () => {
			this.currentRotation += 90;
			this.applyTransformations();
		});

		// 向左旋转
		this.createButton(toolbar, "⟲", "Rotate Left", () => {
			this.currentRotation -= 90;
			this.applyTransformations();
		});

		// 水平翻转
		this.createButton(toolbar, "↔", "Flip Horizontal", () => {
			this.scaleX *= -1;
			this.applyTransformations();
		});

		// 垂直翻转
		this.createButton(toolbar, "↕", "Flip Vertical", () => {
			this.scaleY *= -1;
			this.applyTransformations();
		});

		// 黑白/彩色切换
		this.createButton(toolbar, "B/W", "Toggle Grayscale", () => {
			this.isGrayscale = !this.isGrayscale;
			this.applyTransformations();
		});

		// 重置所有变换
		this.createButton(toolbar, "Reset", "Reset All", () => {
			this.currentRotation = 0;
			this.currentScale = 1;
			this.scaleX = 1;
			this.scaleY = 1;
			this.isGrayscale = false;
			this.applyTransformations();
		});
	}

	// --- Modal 关闭时执行的逻辑 ---
	onClose() {
		this.contentEl.empty();
	}

	// --- 辅助方法 ---

	/**
	 * 创建一个按钮并添加到容器中
	 * @param container - 按钮要添加到的父元素
	 * @param text - 按钮上显示的文本或图标
	 * @param tooltip - 鼠标悬停时显示的提示
	 * @param onClick - 点击按钮时执行的回调函数
	 */
	private createButton(
		container: HTMLElement,
		text: string,
		tooltip: string,
		onClick: () => void
	) {
		const button = container.createEl("button", { text });
		button.setAttribute("aria-label", tooltip);
		button.onClickEvent(onClick);
	}

	/**
	 * 将所有的状态变量应用到图片元素的 style 属性上
	 * 这是实现所有视觉效果的核心函数
	 */
	private applyTransformations() {
		if (!this.imgElement) return;

		// 构建 transform 字符串
		const transforms = [
			`rotate(${this.currentRotation}deg)`,
			`scale(${this.currentScale})`, // 统一使用 scale 进行缩放
			`scaleX(${this.scaleX})`,
			`scaleY(${this.scaleY})`,
		];

		// 构建 filter 字符串
		const filters = [this.isGrayscale ? "grayscale(100%)" : "none"];

		// 应用样式
		this.imgElement.style.transform = transforms.join(" ");
		this.imgElement.style.filter = filters.join(" ");
	}
}
