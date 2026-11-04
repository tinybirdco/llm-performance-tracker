import { X, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboarding } from '@/app/context/OnboardingContext'
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

const ONBOARDING_STEPS = [
  {
    title: 'Get started',
    description: 'Deploy this template to your Tinybird workspace, instrument your LLM calls and use the hosted dashboard',
    component: 'GetStarted',
    targetSelector: '[data-onboarding-modal]',
    isInitialStep: true
  },
  {
    title: 'Your LLM calls',
    description: 'Live Demo: Use the AI features to see how your LLM calls are instrumented',
    component: 'LLMCalls',
    targetSelector: '[data-llm-calls-button]'
  },
  {
    title: 'AI Cost Calculator',
    description: 'Visualize your AI costs using natural language and AI',
    component: 'CostCalculator',
    targetSelector: '[data-calculator-button]'
  },
  {
    title: 'Filter Chips',
    description: 'Filter your data by multiple criteria using AI',
    component: 'FilterChips',
    targetSelector: '[data-search-input]'
  },
  {
    title: 'Vector Search',
    description: 'Search your LLM calls using vector search',
    component: 'VectorSearch',
    targetSelector: '[data-table-search]'
  }
]

// Tab configuration for the first step
const TABS = [
  {
    id: 'deploy',
    label: 'Deploy',
    learnMoreUrl: 'https://github.com/tinybirdco/llm-performance-tracker?tab=readme-ov-file#build-and-deploy-your-own-llm-tracker',
    snippet: `# install the tinybird CLI
curl https://tinybird.co | sh

# select or create a new workspace
tb login

# deploy the template
tb --cloud deploy --template https://github.com/tinybirdco/llm-performance-tracker/tree/main/tinybird

# copy the token to the clipboard
tb --cloud token copy read_pipes && TINYBIRD_TOKEN=$(pbpaste)

# use the hosted dashboard with your data
open https://llm-tracker.tinybird.live\\?token\\=$TINYBIRD_TOKEN`,
    language: 'bash'
  },
  {
    id: 'litellm',
    label: 'LiteLLM',
    learnMoreUrl: 'https://www.tinybird.co/docs/forward/get-data-in/guides/ingest-litellm',
    snippet: `import litellm
from litellm import acompletion
from tb.litellm.handler import TinybirdLitellmAsyncHandler

customHandler = TinybirdLitellmAsyncHandler(
    api_url="https://api.us-east.aws.tinybird.co", 
    tinybird_token=os.getenv("TINYBIRD_TOKEN"), 
    datasource_name="litellm"
)

litellm.callbacks = [customHandler]

response = await acompletion(
    model="gpt-3.5-turbo", 
    messages=[{"role": "user", "content": "Hi 👋 - i'm openai"}],
    user=<your_user_id>,
    metadata={
        "organization": <organization_id>,
        "environment": <environment>,
        "project": <project>,
    },
)
`,
    language: 'python'
  },
  {
    id: 'vercel',
    label: 'Vercel AI SDK',
    learnMoreUrl: 'https://www.tinybird.co/docs/forward/get-data-in/guides/ingest-vercel-ai-sdk',
    snippet: `const wrappedOpenAI = wrapModelWithTinybird(
  openai('gpt-3.5-turbo'),
  process.env.NEXT_PUBLIC_TINYBIRD_API_URL!,
  process.env.TINYBIRD_EVENTS_TOKEN,
  {
    event: 'search_filter',
    environment: process.env.NODE_ENV,
    project: <project>,
    organization: <organization>,
    chatId: generateRandomChatId(),
    user: hashApiKeyUser(apiKey),
    systemPrompt: <systemPromptText>,
  }
);

const result = await generateObject({
  model: wrappedOpenAI,
  schema: filterSchema,
  prompt,
  systemPrompt: systemPromptText,
} as any);`,
    language: 'typescript'
  }
]

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const { currentStep, setCurrentStep } = useOnboarding()
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState('deploy')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Check if all target elements are available
    const checkTargets = () => {
      const allTargetsAvailable = ONBOARDING_STEPS.every(step => {
        // Skip the initial step as it doesn't need a target element
        if (step.isInitialStep) return true
        const element = document.querySelector(step.targetSelector)
        return element !== null
      })

      if (allTargetsAvailable) {
        setIsReady(true)
      } else {
        // If not all targets are available, try again in 100ms
        setTimeout(checkTargets, 100)
      }
    }

    checkTargets()
  }, [])

  useEffect(() => {
    if (!isOpen || !isReady) return

    // Skip positioning for the initial step
    if (ONBOARDING_STEPS[currentStep].isInitialStep) {
      // Center the modal in the viewport
      const modalWidth = 800 // Larger width for initial step
      const modalHeight = 700 // Larger height for initial step
      const top = (window.innerHeight - modalHeight) / 2
      const left = (window.innerWidth - modalWidth) / 2
      setPosition({ top, left })
      return
    }

    const targetElement = document.querySelector(ONBOARDING_STEPS[currentStep].targetSelector)
    if (!targetElement) return

    // Add highlight class to target element
    targetElement.classList.add('onboarding-highlight')

    const rect = targetElement.getBoundingClientRect()
    const modalWidth = 573 // Exact modal width
    const modalHeight = 540 // Exact modal height
    const padding = 20

    let top = rect.top - modalHeight - padding
    let left = rect.left // Align with target's left edge

    // Adjust position if modal would go off screen
    if (top < padding) {
      top = rect.bottom + padding
    }

    if (left < padding) {
      left = padding
    }

    if (left + modalWidth > window.innerWidth - padding) {
      left = window.innerWidth - modalWidth - padding
    }

    setPosition({ top, left })

    // Cleanup function to remove highlight
    return () => {
      targetElement.classList.remove('onboarding-highlight')
    }
  }, [currentStep, isOpen, isReady])

  if (!isOpen || !isReady) return null

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onClose()
      setCurrentStep(0)
    }
  }

  const handleSkip = () => {
    onClose()
    setCurrentStep(0)
  }

  const handleCopySnippet = () => {
    const activeTabData = TABS.find(tab => tab.id === activeTab)
    if (activeTabData) {
      navigator.clipboard.writeText(activeTabData.snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const renderGetStartedStep = () => {
    const activeTabData = TABS.find(tab => tab.id === activeTab)
    
    return (
      <div className="flex flex-col h-full">
        {/* Tabs */}
        <div className="flex mb-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={cn(
                'px-4 py-2 text-sm font-normal transition-colors',
                activeTab === tab.id 
                  ? 'text-[#27F795] border-b-2 border-[#27F795]' 
                  : 'text-[#8D8D8D] hover:text-white'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Code snippet with copy button */}
        <div className="relative bg-[#2A2A2A] rounded-md mb-6 overflow-auto h-[400px]">
          <button
            onClick={handleCopySnippet}
            className="absolute top-2 right-2 p-2 rounded-md bg-[#1C1C1C] text-[#8D8D8D] hover:text-white transition-colors z-10"
            aria-label="Copy code"
          >
            {copied ? <Check className="h-4 w-4 text-[#27F795]" /> : <Copy className="h-4 w-4" />}
          </button>
          <SyntaxHighlighter
            language={activeTabData?.language || 'bash'}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '24px',
              background: '#2A2A2A',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              overflow: 'auto',
              height: '100%'
            }}
            showLineNumbers={false}
          >
            {activeTabData?.snippet || ''}
          </SyntaxHighlighter>
        </div>
      </div>
    )
  }

  const isInitialStep = ONBOARDING_STEPS[currentStep].isInitialStep
  const modalWidth = isInitialStep ? 800 : 573
  const modalHeight = isInitialStep ? 700 : 540

  return (
    <div className="fixed inset-0 z-50 font-['Roboto']">
      <div className="fixed inset-0 bg-black/75" onClick={handleSkip} />
      <div
        data-onboarding-modal
        className="fixed bg-[#1C1C1C] overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${modalWidth}px`,
          height: `${modalHeight}px`,
          transform: 'translate(0, 0)',
        }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between p-4 pb-0">
          <div className="flex items-center space-x-2">
            <h2 className="title-font">
              {ONBOARDING_STEPS[currentStep].title}
            </h2>
            {ONBOARDING_STEPS[currentStep].title !== 'Your LLM calls' && ONBOARDING_STEPS[currentStep].title !== 'Get started' && (
              <Sparkles className="h-4 w-4 text-white" />
            )}
          </div>
          <button 
            onClick={handleSkip}
            className="settings-button"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Description */}
        <div className="px-4 pt-1">
          <p className="text-[#8D8D8D] text-sm">
            {ONBOARDING_STEPS[currentStep].description}
          </p>
        </div>

        {/* Rest of modal content */}
        <div className="flex flex-col h-[calc(100%-88px)] pt-8">
          {isInitialStep ? (
            renderGetStartedStep()
          ) : (
            <div className="flex-1 bg-black/50 mb-8 flex items-center justify-center overflow-hidden">
              <video
                className={`w-full h-full ${
                  ONBOARDING_STEPS[currentStep].component === 'LLMCalls' 
                    ? 'object-contain' 
                    : 'object-cover'
                }`}
                autoPlay
                muted
                loop
                playsInline
                src={`/onboarding/${ONBOARDING_STEPS[currentStep].component.toLowerCase()}.mp4`}
              />
            </div>
          )}

          {/* Navigation controls - always visible */}
          <div className="flex items-center justify-between bg-[#1C1C1C]">
            <div className="flex gap-2 pl-4">
              {ONBOARDING_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'w-3 h-3 rounded-full',
                    currentStep === index ? 'bg-[#27F795]' : 'bg-[#C6C6C6]'
                  )}
                />
              ))}
            </div>

            <div className="flex">
              {currentStep === 0 ? (
                <a
                  href={activeTab === 'deploy' 
                    ? 'https://github.com/tinybirdco/llm-performance-tracker?tab=readme-ov-file#build-and-deploy-your-own-llm-tracker'
                    : activeTab === 'litellm'
                    ? 'https://www.tinybird.co/docs/forward/get-data-in/guides/ingest-litellm'
                    : 'https://www.tinybird.co/docs/forward/get-data-in/guides/ingest-vercel-ai-sdk'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-[48px] px-12 text-[#F4F4F4] hover:text-white transition-colors flex items-center"
                >
                  {activeTab === 'deploy' 
                    ? 'Fork and build your own'
                    : activeTab === 'litellm'
                    ? 'Learn about LiteLLM'
                    : 'Learn about Vercel AI SDK'
                  }
                </a>
              ) : (
                <button
                  onClick={() => setCurrentStep(0)}
                  className="h-[48px] px-12 text-[#F4F4F4] hover:text-white transition-colors"
                >
                  Getting Started
                </button>
              )}
              <button
                onClick={handleNext}
                className="h-[48px] px-12 bg-[#27F795] text-black hover:bg-[#20C77A] transition-colors"
              >
                {currentStep === 0 ? 'Tour' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 