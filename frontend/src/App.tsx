import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Check,
  Download,
  FileImage,
  FileText,
  Files,
  FileUp,
  Image,
  LockKeyhole,
  Menu,
  Minimize2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'

import { compressImage } from './utils/imageCompressor'
import type { CompressionResult } from './utils/imageCompressor'
import './App.css'

type Category = 'image' | 'pdf' | 'document'

type UploadedFile = {
  id: string
  file: File
  category: Category
}

type ProcessedFile = {
  id: string
  result: CompressionResult
}

const categories: {
  id: Category
  label: string
  description: string
  extensions: string
}[] = [
  {
    id: 'image',
    label: 'Images',
    description: 'JPG, PNG, WebP, AVIF',
    extensions: '.jpg,.jpeg,.png,.webp,.avif',
  },
  {
    id: 'pdf',
    label: 'PDF',
    description: 'PDF documents',
    extensions: '.pdf',
  },
  {
    id: 'document',
    label: 'Documents',
    description: 'Word, Excel, PowerPoint',
    extensions: '.docx,.xlsx,.pptx',
  },
]

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))

  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
}

const getCategory = (file: File): Category | null => {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension || '')) {
    return 'image'
  }

  if (extension === 'pdf') return 'pdf'

  if (['docx', 'xlsx', 'pptx'].includes(extension || '')) {
    return 'document'
  }

  return null
}

function App() {
  const [activeCategory, setActiveCategory] = useState<Category>('image')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [targetSize, setTargetSize] = useState('100')
  const [sizeUnit, setSizeUnit] = useState('KB')
  const [isDragging, setIsDragging] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)

  const [isCompressing, setIsCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ProcessedFile[]>([])
  const [compressionError, setCompressionError] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  const selectedCategory = categories.find(
    (category) => category.id === activeCategory,
  )!

  const totalSize = files.reduce(
    (total, item) => total + item.file.size,
    0,
  )

  // ADD FILES
  const addFiles = (selectedFiles: FileList | File[]) => {
    setResults([])
    setCompressionError('')

    const newFiles: UploadedFile[] = Array.from(selectedFiles)
      .map((file) => {
        const category = getCategory(file)

        if (!category) return null

        return {
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          category,
        }
      })
      .filter((item): item is UploadedFile => item !== null)
      .filter((item) => item.category === activeCategory)

    setFiles((previous) => {
      const combined = [...previous, ...newFiles]
      return combined.slice(0, 20)
    })
  }

  // FILE INPUT
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files)
      event.target.value = ''
    }
  }

  // DRAG AND DROP
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)

    if (event.dataTransfer.files) {
      addFiles(event.dataTransfer.files)
    }
  }

  // REMOVE FILE
  const removeFile = (id: string) => {
    setResults([])
    setCompressionError('')
    setFiles((previous) => previous.filter((item) => item.id !== id))
  }

  // CHANGE CATEGORY
  const changeCategory = (category: Category) => {
    setActiveCategory(category)
    setFiles([])
    setResults([])
    setCompressionError('')
    setProgress(0)
  }

  // COMPRESS FILES
  const handleCompress = async () => {
    setCompressionError('')
    setResults([])

    if (files.length === 0) {
      setCompressionError('Please upload at least one file.')
      return
    }

    if (activeCategory === 'document') {
      setCompressionError(
        'Office document compression is not available yet. Please select an image or PDF.',
      )
      return
    }

    const value = Number(targetSize)

    if (!Number.isFinite(value) || value <= 0) {
      setCompressionError(
        'Enter a valid target size greater than zero.',
      )
      return
    }

    const targetBytes =
      value * (sizeUnit === 'MB' ? 1024 * 1024 : 1024)

    const targetSizeKb = targetBytes / 1024

    setIsCompressing(true)
    setProgress(0)

    const completed: ProcessedFile[] = []

    try {
      for (let index = 0; index < files.length; index += 1) {
        const item = files[index]

        let result: CompressionResult

        // IMAGE COMPRESSION
        if (item.category === 'image') {
          result = await compressImage(item.file, {
            targetSizeBytes: targetBytes,
          })
        }

        // PDF COMPRESSION THROUGH FASTAPI
        else if (item.category === 'pdf') {
          const formData = new FormData()

          formData.append('file', item.file)
          formData.append(
            'target_size_kb',
            String(targetSizeKb),
          )

          const apiBaseUrl = import.meta.env.VITE_API_URL

          const response = await fetch(
            `${apiBaseUrl}/api/pdf/compress`,
            {
              method: 'POST',
              body: formData,
            },
          )

          if (!response.ok) {
            let message = 'PDF compression failed. Please try again.'

            try {
              const errorData = await response.json()

              if (typeof errorData.detail === 'string') {
                message = errorData.detail
              }
            } catch {
              // Keep fallback error.
            }

            throw new Error(message)
          }

          const compressedBlob = await response.blob()

          const originalSize =
            Number(response.headers.get('X-Original-Size')) ||
            item.file.size

          const compressedSize =
            Number(response.headers.get('X-Compressed-Size')) ||
            compressedBlob.size

          const baseName = item.file.name.replace(/\.pdf$/i, '')

          const compressedFile = new File(
            [compressedBlob],
            `${baseName}_compressed.pdf`,
            {
              type: 'application/pdf',
              lastModified: Date.now(),
            },
          )

          result = {
            file: compressedFile,
            originalSize,
            compressedSize,
            achievedTarget: compressedSize <= targetBytes,
          }
        } else {
          throw new Error('Unsupported file type.')
        }

        completed.push({
          id: item.id,
          result,
        })

        setResults([...completed])

        setProgress(
          Math.round(((index + 1) / files.length) * 100),
        )
      }
    } catch (error) {
      setCompressionError(
        error instanceof Error
          ? error.message
          : 'Compression failed. Please try again.',
      )
    } finally {
      setIsCompressing(false)
    }
  }

  // DOWNLOAD COMPRESSED FILE
  const handleDownload = (file: File) => {
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')

    link.href = url
    link.download = file.name

    document.body.appendChild(link)
    link.click()
    link.remove()

    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="app-shell">
      {/* NAVBAR */}
      <nav className="navbar">
        <a href="#" className="brand">
          <span className="brand-icon">
            <Minimize2 size={20} strokeWidth={2.5} />
          </span>
          <span>
            shrink<span className="brand-accent">o</span>
          </span>
        </a>

        <div className={`nav-links ${mobileMenu ? 'nav-open' : ''}`}>
          <a href="#compressor" onClick={() => setMobileMenu(false)}>
            Compress
          </a>

          <a href="#features" onClick={() => setMobileMenu(false)}>
            Features
          </a>

          <a href="#how-it-works" onClick={() => setMobileMenu(false)}>
            How it works
          </a>

          <a href="#about" onClick={() => setMobileMenu(false)}>
            About
          </a>
        </div>

        <div className="nav-right">
          <span className="privacy-label">
            <LockKeyhole size={14} />
            100% Private
          </span>

          <button
            className="mobile-menu"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle navigation"
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>

          <a href="#compressor" className="nav-button">
            Start compressing <ArrowRight size={15} />
          </a>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="hero-content">
            <div className="eyebrow">
              <Sparkles size={14} />
              SIMPLE. SMART. SHRINKED.
            </div>

            <h1>
              Less size.
              <br />
              <span>More possibilities.</span>
            </h1>

            <p className="hero-description">
              Compress images, PDFs and documents without the unnecessary
              hassle. Get smaller files while keeping quality in mind.
            </p>

            <div className="hero-actions">
              <a href="#compressor" className="primary-button">
                Compress your files <ArrowRight size={17} />
              </a>

              <span className="hero-note">
                <ShieldCheck size={16} /> No signup required
              </span>
            </div>

            <div className="hero-stats">
              <div>
                <strong>3+</strong>
                <span>File categories</span>
              </div>

              <div>
                <strong>20</strong>
                <span>Files per batch</span>
              </div>

              <div>
                <strong>Easy</strong>
                <span>Workflow</span>
              </div>
            </div>
          </div>

          {/* HERO VISUAL */}
          <div className="hero-visual">
            <div className="visual-card">
              <div className="visual-top">
                <span className="visual-dot" />
                <span>FILE OPTIMIZATION</span>
                <span className="visual-status">READY</span>
              </div>

              <div className="visual-file">
                <div className="visual-file-icon">
                  <FileImage size={25} />
                </div>

                <div className="visual-file-info">
                  <strong>project-image.png</strong>
                  <span>Original file · 4.8 MB</span>
                </div>

                <span className="visual-file-size">4.8 MB</span>
              </div>

              <div className="visual-arrow">
                <ArrowDown size={20} />
              </div>

              <div className="visual-result">
                <div className="result-icon">
                  <Check size={23} />
                </div>

                <div>
                  <strong>Optimized file</strong>
                  <span>Quality-focused compression</span>
                </div>

                <span className="result-tag">Preview</span>
              </div>

              <div className="visual-bottom">
                <Zap size={15} />
                Your files, made lighter.
              </div>
            </div>

            <div className="floating-badge badge-one">
              <Sparkles size={16} /> Smart workflow
            </div>

            <div className="floating-badge badge-two">
              <LockKeyhole size={15} /> Privacy first
            </div>
          </div>
        </section>

        {/* COMPRESSOR */}
        <section className="compressor-section" id="compressor">
          <div className="section-heading">
            <span className="section-kicker">THE COMPRESSION STUDIO</span>

            <h2>
              Make your files <span>lighter.</span>
            </h2>

            <p>Three simple steps. One cleaner file workflow.</p>
          </div>

          <div className="compressor-card">
            {/* CATEGORY TABS */}
            <div className="category-tabs">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`category-tab ${
                    activeCategory === category.id ? 'active' : ''
                  }`}
                  onClick={() => changeCategory(category.id)}
                >
                  {category.id === 'image' && <Image size={19} />}
                  {category.id === 'pdf' && <FileText size={19} />}
                  {category.id === 'document' && <Files size={19} />}

                  <span>{category.label}</span>
                </button>
              ))}
            </div>

            <div className="upload-area">
              {/* HIDDEN FILE INPUT */}
              <input
                ref={inputRef}
                type="file"
                accept={selectedCategory.extensions}
                multiple
                hidden
                onChange={handleInputChange}
              />

              {/* DROPZONE */}
              <div
                className={`dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    inputRef.current?.click()
                  }
                }}
              >
                <div className="upload-icon">
                  <FileUp size={28} />
                </div>

                <h3>Drop your files here</h3>

                <p>
                  or <span>browse files</span> from your device
                </p>

                <div className="upload-formats">
                  {selectedCategory.description}
                </div>
              </div>

              {/* SELECTED FILES */}
              {files.length > 0 && (
                <div className="file-list">
                  <div className="file-list-heading">
                    <div>
                      <h3>Selected files</h3>

                      <span>
                        {files.length} file(s) · {formatBytes(totalSize)}
                      </span>
                    </div>

                    <button
                      className="clear-button"
                      onClick={() => {
                        setFiles([])
                        setResults([])
                        setCompressionError('')
                      }}
                    >
                      Clear all
                    </button>
                  </div>

                  {files.map((item) => (
                    <div className="file-item" key={item.id}>
                      <div className="file-item-icon">
                        {item.category === 'image' ? (
                          <FileImage size={20} />
                        ) : (
                          <FileText size={20} />
                        )}
                      </div>

                      <div className="file-item-info">
                        <strong>{item.file.name}</strong>
                        <span>{formatBytes(item.file.size)}</span>
                      </div>

                      <button
                        className="remove-file"
                        onClick={() => removeFile(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* TARGET SIZE */}
              <div className="target-panel">
                <div className="target-info">
                  <label htmlFor="target-size">Target output size</label>
                  <span>Choose your desired file size</span>
                </div>

                <div className="target-controls">
                  <input
                    id="target-size"
                    type="number"
                    min="1"
                    value={targetSize}
                    onChange={(event) => setTargetSize(event.target.value)}
                    placeholder="100"
                  />

                  <select
                    value={sizeUnit}
                    onChange={(event) => setSizeUnit(event.target.value)}
                    aria-label="Target size unit"
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>
              </div>

              {/* COMPRESS BUTTON */}
              <button
                className="compress-button"
                onClick={handleCompress}
                disabled={
                  files.length === 0 ||
                  !targetSize ||
                  Number(targetSize) <= 0 ||
                  isCompressing
                }
              >
                {isCompressing ? (
                  <>
                    <span className="compression-spinner" />
                    Compressing...
                  </>
                ) : (
                  <>
                    <Minimize2 size={18} />
                    Compress files
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              {/* PROGRESS */}
              {isCompressing && (
                <div className="compression-status" aria-live="polite">
                  <div className="progress-label">
                    <span>Processing files</span>
                    <strong>{progress}%</strong>
                  </div>

                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ERROR */}
              {compressionError && (
                <p className="compression-error" role="alert">
                  {compressionError}
                </p>
              )}

              {/* RESULTS */}
              {results.length > 0 && (
                <div className="results-panel">
                  <h3>Compression results</h3>

                  {results.map(({ id, result }) => {
                    const savedBytes =
                      result.originalSize - result.compressedSize

                    const savedPercent =
                      result.originalSize > 0
                        ? (savedBytes / result.originalSize) * 100
                        : 0

                    return (
                      <div className="result-item" key={id}>
                        <div className="result-details">
                          <strong>{result.file.name}</strong>

                          <span>
                            {formatBytes(result.originalSize)} →{' '}
                            {formatBytes(result.compressedSize)}
                          </span>

                          <span className="result-savings">
                            {savedBytes > 0
                              ? `${savedPercent.toFixed(1)}% smaller`
                              : 'No size reduction achieved'}
                          </span>

                          {!result.achievedTarget && (
                            <span className="result-savings">
                              Target size could not be reached.
                            </span>
                          )}
                        </div>

                        <button
                          className="download-button"
                          onClick={() => handleDownload(result.file)}
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* UPLOAD FOOTER */}
              <div className="upload-footer">
                <span>
                  <LockKeyhole size={13} />
                  Your files stay yours
                </span>

                <span>Maximum 20 files per batch</span>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="features-section" id="features">
          <div className="section-heading">
            <span className="section-kicker">BUILT FOR SIMPLICITY</span>

            <h2>
              Everything you need. <span>Nothing extra.</span>
            </h2>

            <p>A focused toolkit for everyday file optimization.</p>
          </div>

          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon">
                <Zap size={22} />
              </div>

              <h3>Simple workflow</h3>

              <p>
                Upload your files, choose a target size and get ready to
                optimize.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <ShieldCheck size={22} />
              </div>

              <h3>Privacy focused</h3>

              <p>
                A clean, secure-minded experience built around your files.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <Files size={22} />
              </div>

              <h3>Multiple formats</h3>

              <p>
                Work with images, PDFs and popular Office document formats.
              </p>
            </article>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="how-section" id="how-it-works">
          <div className="how-copy">
            <span className="section-kicker">HOW IT WORKS</span>

            <h2>
              Less effort.
              <br />
              <span>Smaller files.</span>
            </h2>

            <p>
              Get started in a few simple steps. No complicated settings or
              confusing workflows.
            </p>
          </div>

          <div className="steps-list">
            <div className="step">
              <span>01</span>
              <div>
                <h3>Choose your file</h3>
                <p>Select an image, PDF or document.</p>
              </div>
            </div>

            <div className="step">
              <span>02</span>
              <div>
                <h3>Set your target</h3>
                <p>Choose the output size you want.</p>
              </div>
            </div>

            <div className="step">
              <span>03</span>
              <div>
                <h3>Compress & download</h3>
                <p>Optimize and download your lighter file.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bottom-cta">
          <div>
            <span className="section-kicker">READY WHEN YOU ARE</span>
            <h2>Your next upload deserves to be lighter.</h2>
          </div>

          <a href="#compressor" className="primary-button">
            Try SHRINKO <ArrowRight size={17} />
          </a>
        </section>

        {/* ABOUT SHRINKO */}
        <section className="about-section" id="about">
          <div className="about-content">
            <span className="section-kicker">ABOUT SHRINKO</span>

            <h2>
              Making file optimization
              <br />
              <span>simple and effortless.</span>
            </h2>

            <p>
              At SHRINKO, we believe managing digital files should be simple,
              efficient, and accessible to everyone.
            </p>

            <p>
              SHRINKO is a modern file compression platform designed to help
              users reduce file sizes while maintaining a thoughtful balance
              between quality and performance. From images to PDF files, our
              goal is to bring essential optimization tools together in one
              convenient place.
            </p>
            
            <div className="about-tagline">
              Optimize Smarter. Share Faster. Do More.
            </div>
          </div>
        </section>

        {/* CONTACT US */}
        <section className="contact-section" id="contact">
          <div className="contact-content">
            <span className="section-kicker">GET IN TOUCH</span>

            <h2>
              Contact <span>Us.</span>
            </h2>

            <p>
              Have a question, suggestion, or feedback?
              Feel free to connect with us.
            </p>

            <div className="contact-links">
              <a
                href="mailto:ankitprajapati56991@gmail.com"
                className="contact-card"
              >
                <div className="contact-icon">
                  
                </div>

                <div className="contact-card-copy">
                  <strong>Email Us</strong>
                  <span>ankitprajapati56991@gmail.com</span>
                </div>

                <ArrowRight size={18} className="contact-arrow" />
              </a>

              <a
                href="https://www.linkedin.com/in/ankitprajapati29"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-card"
              >
                <div className="contact-icon">
                </div>

                <div className="contact-card-copy">
                  <strong>Connect on LinkedIn</strong>
                  <span>Let's connect professionally</span>
                </div>

                <ArrowRight size={18} className="contact-arrow" />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <a href="#" className="brand">
          <span className="brand-icon">
            <Minimize2 size={18} />
          </span>
          <span>
            shrink<span className="brand-accent">o</span>
          </span>
        </a>

        <span>Smaller Files. Better Quality.</span>
        <span>© 2026 SHRINKO</span>
      </footer>
    </div>
  )
}

export default App