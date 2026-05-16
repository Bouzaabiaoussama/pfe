from ultralytics import YOLO
import argparse
from pathlib import Path
import cv2
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fire/Smoke detection on webcam")
    parser.add_argument(
        "--model",
        default=str(Path(__file__).resolve().parent / "weights" / "best.pt"),
        help="Path to the YOLOv8 .pt model",
    )
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")
    parser.add_argument("--camera", type=int, default=0, help="Webcam index")
    parser.add_argument("--max-frames", type=int, default=0, help="Stop after N frames (0 = no limit)")
    parser.add_argument("--no-show", action="store_true", help="Do not open a window")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    model_path = Path(args.model).expanduser().resolve()
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        sys.exit(1)

    model = YOLO(str(model_path))

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("Could not open webcam.")
        sys.exit(1)

    frame_count = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Failed to read frame.")
                break

            frame_count += 1
            results = model.predict(source=frame, conf=args.conf, verbose=False)
            boxes = results[0].boxes

            if len(boxes) > 0:
                print(f"Frame {frame_count}: detections={len(boxes)}")

            annotated = results[0].plot()

            if not args.no_show:
                cv2.imshow("Fire/Smoke Detection", annotated)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

            if args.max_frames and frame_count >= args.max_frames:
                break

    finally:
        cap.release()
        if not args.no_show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
