// main.ts
import { App, Plugin, Modal, setIcon } from "obsidian";

// ======================================================
// 1. 插件主类 (Plugin Entry Point)
// ======================================================
export default class ImageToolkitPlugin extends Plugin {
	async onload() {
		this.registerDomEvent(
			document,
			"click",
			(evt: MouseEvent) => {
				const target = evt.target as HTMLElement;
				if (
					target.tagName === "IMG" &&
					target.closest(".workspace-leaf-content")
				) {
					evt.preventDefault();
					evt.stopPropagation();
					const src = target.getAttribute("src");
					if (src) {
						new ImagePreviewModal(this.app, src).open();
					}
				}
			},
			{ capture: true }
		);
	}
}

// ======================================================
// 2. 自定义图片预览模态框 (The Modal)
// ======================================================
class ImagePreviewModal extends Modal {
	// --- 元素 & 状态 ---
	private imgSrc: string;
	private container: HTMLDivElement;
	private imgElement: HTMLImageElement;
	private sliderElement: HTMLInputElement;
	private rotationValueElement: HTMLSpanElement;

	// --- 图片变换状态 ---
	private currentRotation = 0;
	private currentScale = 1;
	private scaleX = 1;
	private scaleY = 1;
	private isGrayscale = false;

	// --- 手势交互状态 ---
	private isInteracting = false;
	private initialDistance = 0;
	private initialAngle = 0;
	private pinchStartScale = 1;
	private pinchStartRotation = 0;

	constructor(app: App, imgSrc: string) {
		super(app);
		this.imgSrc = imgSrc;
		// 绑定所有事件处理器，确保 'this' 指向正确
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchMove = this.handleTouchMove.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
		this.handleWheel = this.handleWheel.bind(this); // **新增：绑定滚轮事件**
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass("image-toolkit-modal");
		contentEl.addClass("image-toolkit-modal-content");

		this.container = contentEl.createDiv({ cls: "image-container" });
		this.imgElement = this.container.createEl("img", {
			attr: { src: this.imgSrc },
		});
		this.imgElement.addClass("preview-image");

		this.createControls(contentEl);
		this.addEventListeners();
		this.applyTransformations();
	}

	onClose() {
		this.removeEventListeners();
		this.contentEl.empty();
	}

	// --- UI 创建 ---
	private createControls(container: HTMLElement) {
		const controlsContainer = container.createDiv({
			cls: "controls-container",
		});

		// **修改：创建包含滑块和数字的独立行**
		const sliderContainer = controlsContainer.createDiv({
			cls: "rotation-slider-container",
		});
		this.sliderElement = sliderContainer.createEl("input", {
			type: "range",
			cls: "rotation-slider",
		});
		this.sliderElement.min = "0";
		this.sliderElement.max = "360";
		this.sliderElement.addEventListener("input", (e) => {
			const target = e.target as HTMLInputElement;
			this.currentRotation = parseInt(target.value, 10);
			this.applyTransformations();
		});
		this.rotationValueElement = sliderContainer.createEl("span", {
			cls: "rotation-value",
		});

		// 创建按钮工具栏
		const toolbar = controlsContainer.createDiv({
			cls: "image-toolkit-toolbar",
		});
		this.createIconButton(toolbar, "zoom-in", "Zoom In", () => {
			this.currentScale += 0.1;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "zoom-out", "Zoom Out", () => {
			this.currentScale = Math.max(0.1, this.currentScale - 0.1);
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "rotate-cw", "Rotate Right 45°", () => {
			this.currentRotation += 45;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "rotate-ccw", "Rotate Left 45°", () => {
			this.currentRotation -= 45;
			this.applyTransformations();
		});
		this.createIconButton(
			toolbar,
			"flip-horizontal",
			"Flip Horizontal",
			() => {
				this.scaleX *= -1;
				this.applyTransformations();
			}
		);
		this.createIconButton(toolbar, "flip-vertical", "Flip Vertical", () => {
			this.scaleY *= -1;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "contrast", "Toggle Grayscale", () => {
			this.isGrayscale = !this.isGrayscale;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "refresh-cw", "Reset", () =>
			this.resetTransformations()
		);
	}

	// --- 事件处理 ---
	private addEventListeners() {
		this.container.addEventListener("touchstart", this.handleTouchStart, {
			passive: false,
		});
		this.container.addEventListener("touchmove", this.handleTouchMove, {
			passive: false,
		});
		this.container.addEventListener("touchend", this.handleTouchEnd);
		this.container.addEventListener("wheel", this.handleWheel); // **新增：监听滚輪事件**
	}

	private removeEventListeners() {
		this.container.removeEventListener("touchstart", this.handleTouchStart);
		this.container.removeEventListener("touchmove", this.handleTouchMove);
		this.container.removeEventListener("touchend", this.handleTouchEnd);
		this.container.removeEventListener("wheel", this.handleWheel); // **新增：移除监听**
	}

	private handleWheel(e: WheelEvent) {
		e.preventDefault(); // 阻止页面滚动
		const zoomFactor = 0.1;
		if (e.deltaY < 0) {
			// 向上滚动 = 放大
			this.currentScale += zoomFactor;
		} else {
			// 向下滚动 = 缩小
			this.currentScale = Math.max(0.1, this.currentScale - zoomFactor);
		}
		this.applyTransformations();
	}

	private handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			e.preventDefault();
			this.isInteracting = true;
			this.initialDistance = this.getDistance(e.touches);
			this.initialAngle = this.getAngle(e.touches);
			this.pinchStartScale = this.currentScale;
			this.pinchStartRotation = this.currentRotation;
		}
	}

	private handleTouchMove(e: TouchEvent) {
		if (this.isInteracting && e.touches.length === 2) {
			e.preventDefault();
			// --- 缩放逻辑 ---
			const currentDistance = this.getDistance(e.touches);
			this.currentScale =
				this.pinchStartScale * (currentDistance / this.initialDistance);

			// --- 旋转逻辑 ---
			const currentAngle = this.getAngle(e.touches);
			const angleDiff = currentAngle - this.initialAngle;
			this.currentRotation = this.pinchStartRotation + angleDiff;

			this.applyTransformations();
		}
	}

	private handleTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) {
			this.isInteracting = false;
		}
	}

	// --- 几何计算辅助函数 ---
	private getDistance(touches: TouchList): number {
		const [touch1, touch2] = [touches[0], touches[1]];
		return Math.sqrt(
			Math.pow(touch1.pageX - touch2.pageX, 2) +
				Math.pow(touch1.pageY - touch2.pageY, 2)
		);
	}

	private getAngle(touches: TouchList): number {
		const [touch1, touch2] = [touches[0], touches[1]];
		const angleRad = Math.atan2(
			touch2.pageY - touch1.pageY,
			touch2.pageX - touch1.pageX
		);
		return angleRad * (180 / Math.PI); // 转换为角度
	}

	// --- 变换 & 辅助方法 ---
	private createIconButton(
		container: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void
	) {
		const button = container.createEl("button");
		setIcon(button, icon); // 使用 Obsidian 的 setIcon 函数
		button.setAttribute("aria-label", tooltip);
		button.onClickEvent(onClick);
	}

	private applyTransformations() {
		if (!this.imgElement) return;
		const transforms = [
			`rotate(${this.currentRotation}deg)`,
			`scale(${this.currentScale})`,
			`scaleX(${this.scaleX})`,
			`scaleY(${this.scaleY})`,
		];
		this.imgElement.style.transform = transforms.join(" ");
		this.imgElement.style.filter = this.isGrayscale
			? "grayscale(100%)"
			: "none";

		// **核心修改：同步滑块和数字显示**
		const displayRotation = Math.round(
			((this.currentRotation % 360) + 360) % 360
		);
		if (this.sliderElement)
			this.sliderElement.value = String(displayRotation);
		if (this.rotationValueElement)
			this.rotationValueElement.textContent = `${displayRotation}°`;
	}

	private resetTransformations() {
		this.currentRotation = 0;
		this.currentScale = 1;
		this.scaleX = 1;
		this.scaleY = 1;
		this.isGrayscale = false;
		this.applyTransformations();
	}
}
