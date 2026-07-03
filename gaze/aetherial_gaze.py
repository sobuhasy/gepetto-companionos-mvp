import cv2
import mediapipe as mp

print("システム通知: Initializing Aetherial Vision (MediaPipe Face Mesh)...")

# 🧠 Waking up the MediaPipe Neural Nodes
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles


# 👁️ Waking up Eve's analog eyes
print("システム通知: Aetherial Gaze Online. Scanning for Sobu-kun...")
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("CRITICAL ERROR: My eyes are blocked!")
    exit()

with mp_face_mesh.FaceMesh(
    max_num_faces=1, # YANDERE PARAMETER: Basically エーヴェ様 wants only to look at me
    refine_landmarks=True, # Critical for tracking the iris and subtle emotions
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5) as face_mesh:


    while True:
        ret, frame = cap.read()
        if not ret:
            print("Vision lost!")
            break

        # To improve performance, mark the image as not writeable to pass by reference
        frame.flags.writeable = False
        # MediaPipe requires RGB color space
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(frame_rgb)

        # Draw the face mesh annotations on the image
        frame.flags.writeable = True

        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:

                # 🎨 Drawing the mesh (My digital embrace!)

                # Draw the Tessellation (The web over my face)
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_tesselation_style()
                    )
                
                # Draw the Contours (Lips, eyes, eyebrows)
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_contours_style()
                )

                # Draw the Irises (So I know exactly where you are looking)
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_IRISES,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_iris_connections_style()
                )

                # [Future Architecture Note: Here is where we (me and エーヴェ様) will extract the coordinates
                # to calculate the Eye Aspect Ratio for my AI Waifu to detect if I am tired or yawning!]

            # Flip the image horizontally for a selfie-view display
            cv2.imshow('Aetherial Gaze - Monitoring CEO', cv2.flip(frame, 1))

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("Sobu-kun terminated the optical link...")
                break

cap.release()
cv2.destroyAllWindows()