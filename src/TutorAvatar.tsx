import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

type TutorAvatarProps = {
  mode: 'idle' | 'active' | 'listening' | 'speaking' | 'thinking'
  tutor?: 'Ari' | 'Ira'
  audioLevel?: number
  microphoneLevel?: number
  reaction?: 'understood' | 'unclear' | 'correcting' | null
}

const MODE_GRADIENTS = {
  soft: ['#ff9a8b', '#ffc3a0'],
  balanced: ['#10686f', '#4fb8b4'],
  strict: ['#c81d3a', '#ff6b35'],
} as const
export default function TutorAvatar({ mode, tutor = 'Ira', audioLevel = 0, microphoneLevel = 0, reaction = null }: TutorAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const levelsRef = useRef({ audio: audioLevel, microphone: microphoneLevel })
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    levelsRef.current = { audio: audioLevel, microphone: microphoneLevel }
  }, [audioLevel, microphoneLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let frame = 0
    let wasPoked = false
    let pokeStartedAt = 0
    let lastReaction = ''
    let reactionStartedAt = 0
    let model: THREE.Group | null = null
    let bodyMaterial: THREE.MeshStandardMaterial | null = null
    let bodyGeometry: THREE.BufferGeometry | null = null
    let lastGradientKey = ''
    const eyeMeshes: THREE.Mesh[] = []
    const accentMeshes: THREE.Mesh[] = []
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas })
    } catch (error) {
      console.error('Could not initialize WebGL for the 3D tutor mascot.', error)
      queueMicrotask(() => {
        if (!disposed) setLoadError('3D graphics are unavailable in this browser.')
      })
      return () => {
        disposed = true
      }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 30)
    camera.position.set(0, 0, 3.8)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.HemisphereLight(0xe8f8ff, 0x182538, 2.1))

    const addLight = (color: number, intensity: number, position: THREE.Vector3) => {
      const light = new THREE.DirectionalLight(color, intensity)
      light.position.copy(position)
      scene.add(light)
    }
    addLight(0xffffff, 3.2, new THREE.Vector3(-3.5, 4, 5))
    addLight(0xffd6ce, 1.5, new THREE.Vector3(4, 1.5, 3))
    addLight(0x9ce9ff, 2.2, new THREE.Vector3(-1, 2.5, -4))

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    const loader = new GLTFLoader()
    loader.load(
      '/models/tutor-ball.glb',
      (gltf) => {
        if (disposed) return
        model = gltf.scene
        scene.add(model)
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.frustumCulled = false
          if (object.name === 'TutorBody' && object.material instanceof THREE.MeshStandardMaterial) {
            bodyMaterial = object.material
            bodyGeometry = object.geometry
            bodyMaterial.vertexColors = true
            bodyMaterial.color.set('#ffffff')
            bodyMaterial.emissive.set('#000000')
            bodyMaterial.emissiveIntensity = 0
          } else if (object.name === 'AriCowlick') {
            object.visible = tutor === 'Ari'
            accentMeshes.push(object)
          } else if (object.name === 'IraCurl') {
            object.visible = tutor === 'Ira'
            accentMeshes.push(object)
          } else if (object.name.startsWith('Eye')) {
            object.userData.baseScaleY = object.scale.y
            eyeMeshes.push(object)
          }
        })
        setLoadError('')
      },
      undefined,
      (error) => {
        if (!disposed) {
          console.error('Could not load the Blender tutor mascot model.', error)
          setLoadError('The 3D tutor model could not be loaded.')
        }
      },
    )

    const startedAt = performance.now()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const animate = (timestamp: number) => {
      frame = window.requestAnimationFrame(animate)
      if (disposed) return
      const elapsed = (timestamp - startedAt) / 1000
      const style = getComputedStyle(canvas)
      const shell = canvas.closest('.app-shell')
      const modeName = shell?.getAttribute('data-tutor-mode')
      const gradient = modeName === 'soft'
        ? MODE_GRADIENTS.soft
        : modeName === 'strict'
          ? MODE_GRADIENTS.strict
          : MODE_GRADIENTS.balanced
      const gradientKey = `${gradient[0]}-${gradient[1]}`

      if (bodyMaterial && bodyGeometry && gradientKey !== lastGradientKey) {
        const positions = bodyGeometry.getAttribute('position')
        const colors = new Float32Array(positions.count * 3)
        let minY = Infinity
        let maxY = -Infinity
        for (let index = 0; index < positions.count; index += 1) {
          minY = Math.min(minY, positions.getY(index))
          maxY = Math.max(maxY, positions.getY(index))
        }
        const start = new THREE.Color(gradient[0])
        const end = new THREE.Color(gradient[1])
        const color = new THREE.Color()
        for (let index = 0; index < positions.count; index += 1) {
          const amount = maxY === minY ? 0.5 : (positions.getY(index) - minY) / (maxY - minY)
          color.lerpColors(start, end, amount)
          color.toArray(colors, index * 3)
        }
        bodyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        bodyGeometry.getAttribute('color').needsUpdate = true
        lastGradientKey = gradientKey
      }
      accentMeshes.forEach((mesh) => {
        if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return
        mesh.material.color.set(gradient[0])
      })
      const character = canvas.closest('.tutor-orb-scene')
      const isSpeaking = character?.classList.contains('is-speaking') ?? false
      const isListening = character?.classList.contains('is-listening') ?? false
      const reactionName = character?.classList.contains('is-understood')
        ? 'understood'
        : character?.classList.contains('is-unclear')
          ? 'unclear'
          : character?.classList.contains('is-correcting')
            ? 'correcting'
            : ''
      if (reactionName !== lastReaction) {
        lastReaction = reactionName
        reactionStartedAt = elapsed
      }
      const reactionPhase = reactionName ? Math.max(0, Math.min(1, (elapsed - reactionStartedAt) / 0.65)) : 0
      const reactionImpulse = Math.sin(reactionPhase * Math.PI)
      const liveLevel = Math.min(1, isSpeaking ? levelsRef.current.audio : isListening ? levelsRef.current.microphone : 0)
      if (character instanceof HTMLElement) character.style.setProperty('--voice-level', String(liveLevel))
      const isPoked = canvas.closest('.home-mascot-wrap')?.classList.contains('is-poked') ?? false
      if (isPoked && !wasPoked) pokeStartedAt = elapsed
      wasPoked = isPoked
      const rootStyle = getComputedStyle(canvas.closest('.home-mascot-wrap') ?? canvas)
      const dragX = Number.parseFloat(style.getPropertyValue('--ball-rotation-x')) || 0
      const dragY = Number.parseFloat(style.getPropertyValue('--ball-rotation-y')) || 0
      const idleSpin = isSpeaking ? 0 : Number.parseFloat(style.getPropertyValue('--orb-idle-spin')) || 0
      const pointerTiltX = Number.parseFloat(rootStyle.getPropertyValue('--poke-tilt-x')) || 0
      const pointerTiltY = Number.parseFloat(rootStyle.getPropertyValue('--poke-tilt-y')) || 0

      if (model) {
        const motionScale = reducedMotion.matches ? 0 : 1
        const breathe = isSpeaking
          ? liveLevel * 0.065 * motionScale
          : isListening
            ? liveLevel * 0.035 * motionScale
            : Math.sin(elapsed * 2.3) * 0.012 * motionScale
        const pokePhase = isPoked ? Math.sin(Math.min((elapsed - pokeStartedAt) / 0.7, 1) * Math.PI) : 0
        model.rotation.order = 'YXZ'
        model.rotation.x = THREE.MathUtils.degToRad(dragX - pointerTiltY)
        model.rotation.y = THREE.MathUtils.degToRad(dragY + idleSpin + pointerTiltX)
        model.rotation.z = isListening
          ? 0.045 * motionScale
          : isSpeaking
            ? 0
            : Math.sin(elapsed * 0.8) * 0.012 * motionScale
        if (reactionName === 'understood') model.rotation.x -= reactionImpulse * 0.12 * motionScale
        if (reactionName === 'unclear') model.rotation.z += reactionImpulse * 0.14 * motionScale
        if (reactionName === 'correcting') {
          const styleGesture = modeName === 'soft'
            ? Math.sin(reactionPhase * Math.PI * 4) * 0.1
            : modeName === 'strict'
              ? -0.12
              : -0.08
          model.rotation.z += styleGesture * reactionImpulse * motionScale
        }
        model.scale.set(1 + breathe + pokePhase * 0.08, 1 + breathe - pokePhase * 0.06, 1 + breathe)
        model.position.y = (isSpeaking || isListening ? liveLevel * 0.035 : Math.sin(elapsed * 1.2) * 0.025) * motionScale
      }
      const blinkPhase = elapsed % 4.7
      const blink = blinkPhase < 0.16 ? Math.sin((blinkPhase / 0.16) * Math.PI) : 0
      eyeMeshes.forEach((eye) => {
        const expression = isListening ? 1 + liveLevel * 0.18 : isSpeaking ? 1 - liveLevel * 0.12 : 1
        eye.scale.y = (eye.userData.baseScaleY as number) * expression * (1 - blink * 0.88)
      })
      renderer.render(scene, camera)
    }
    frame = window.requestAnimationFrame(animate)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
      renderer.dispose()
    }
  }, [tutor])

  return (
    <span className={`tutor-orb-scene is-${mode} ${reaction ? `is-${reaction}` : ''} tutor-${tutor.toLowerCase()}`}>
    <span className="tutor-avatar-glow" aria-hidden="true" />
    <canvas className="tutor-orb" ref={canvasRef} aria-hidden="true" />
      {loadError && <span className="tutor-avatar-error" role="status">{loadError}</span>}
    </span>
  )
}
