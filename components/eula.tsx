"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface EulaAgreementProps {
  onAgree: () => void
  onDisagree: () => void
}

export function EulaAgreement({ onAgree, onDisagree }: EulaAgreementProps) {
  const [isBottom, setIsBottom] = useState(false)

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const element = e.target as HTMLDivElement
      const { scrollTop, scrollHeight, clientHeight } = element
      if (scrollHeight - scrollTop <= clientHeight + 1) {
        setIsBottom(true)
      }
    }

    const scrollArea = document.querySelector("[data-radix-scroll-area-viewport]")
    if (scrollArea) {
      scrollArea.addEventListener("scroll", handleScroll)
    }
    return () => {
      if (scrollArea) {
        scrollArea.removeEventListener("scroll", handleScroll)
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center dark:text-white">End User License Agreement</h2>
      <ScrollArea className="h-[600px] rounded-md border p-4 dark:border-gray-700">
        <div className="space-y-4 dark:text-gray-300">
          <p>This End-User License Agreement (&quot;EULA&quot;) is a legal agreement between you and QuantTraderTools.com.</p>
          <p>This EULA agreement governs your acquisition and use of our QuantCopier software (&quot;Software&quot;) directly from QuantTraderTools.com or indirectly through a QuantTraderTools.com authorized reseller or distributor (a &quot;Reseller&quot;).</p>
          <p>Please read this EULA agreement carefully before completing the installation process and using the QuantCopier software. It provides a license to use the QuantCopier software and contains warranty information and liability disclaimers.</p>
          <p>By installing and/or using the QuantCopier software, you are confirming your acceptance of the Software and agreeing to become bound by the terms of this EULA agreement.</p>

          <h2 className="font-bold">License Grant</h2>
          <p>QuantTraderTools.com hereby grants you a personal, non-transferable, non-exclusive licence to use the QuantCopier software on your devices in accordance with the terms of this EULA agreement.</p>
          <p>You are permitted to load the QuantCopier software (for example, a PC, laptop, or virtual machine) under your control. QuantCopier software will run only on Windows OS. You are responsible for ensuring your device meets the minimum requirements of the MT5 software, which can be found on the MetaTrader5 website. For VMs, the suggested minimum requirement is similar to AWS t3.micro or ideally higher.</p>

          <h2 className="font-bold">Restrictions</h2>
          <p>You are not permitted to:</p>
          <ul>
            <li>Edit, alter, modify, adapt, translate, or otherwise change the whole or any part of the Software, nor permit any part of the Software to be combined with or become incorporated in any other software, nor decompile, disassemble, or reverse engineer the Software or attempt to do any such things.</li>
            <li>Reproduce, copy, distribute, resell, or otherwise use the Software for any commercial purpose.</li>
            <li>Allow any third party to use the Software on behalf of or for the benefit of any third party.</li>
            <li>Use the Software in any way which breaches any applicable local, national, or international law.</li>
            <li>Use the Software for any purpose that QuantTraderTools.com considers is a breach of this EULA agreement.</li>
          </ul>

          <h2 className="font-bold">Intellectual Property and Ownership</h2>
          <p>QuantTraderTools.com shall at all times retain ownership of the Software as originally downloaded by you and all subsequent downloads of the Software by you. The Software (and the copyright, and other intellectual property rights of whatever nature in the Software, including any modifications made thereto) are and shall remain the property of QuantTraderTools.com.</p>

          <h2 className="font-bold">Permissions Required</h2>
          <p>By agreeing to this EULA, you give permission for the QuantCopier to do the following:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use your MetaTrader5 Login credentials to place, execute, and manage trades.</li>
            <li>Send notifications to your Telegram account through a bot.</li>
            <li>Use your Telegram account for authentication.</li>
          </ul>

          <h2 className="font-bold">Disclaimer of Liability</h2>
          <p>The Software is provided &quot;as is&quot; and QuantTraderTools.com disclaims all warranties with regard to this Software, including all implied warranties of merchantability and fitness. In no event shall QuantTraderTools.com be liable for any special, direct, indirect, or consequential damages or any damages whatsoever resulting from loss of use, data, or profits, whether in an action of contract, negligence, or other tortious action, arising out of or in connection with the use or performance of this Software.</p>

          <h2 className="font-bold">No Warranties</h2>
          <p>QuantTraderTools.com makes no warranty that the Software will meet your requirements or operate under your specific conditions of use. QuantTraderTools.com makes no warranty that operation of the Software will be secure, error-free, or free from interruption.</p>
          <p className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 italic">
            YOU MUST DETERMINE WHETHER THE SOFTWARE SUFFICIENTLY MEETS YOUR REQUIREMENTS FOR SECURITY AND UNINTERRUPTED OPERATIONS. YOU BEAR SOLE RESPONSIBILITY AND ALL LIABILITY FOR ANY LOSS INCURRED DUE TO FAILURE OF THE SOFTWARE TO MEET YOUR REQUIREMENTS. QUANTTRADERTOOLS.COM WILL NOT, UNDER ANY CIRCUMSTANCES, BE RESPONSIBLE OR LIABLE FOR THE LOSS OF DATA OR CAPITAL ON ANY COMPUTER OR INFORMATION STORAGE DEVICE.
          </p>

          <h2 className="font-bold">Governing Law</h2>
          <p>This EULA agreement, and any dispute arising out of or in connection with this EULA agreement, shall be governed by and construed in accordance with the laws of Coimbatore, Tamil Nadu, India.</p>

          <h2 className="font-bold">Acknowledgement</h2>
          <p className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 italic">
            BY INSTALLING THE SOFTWARE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTAND THE FOREGOING AND THAT YOU AGREE TO BE BOUND BY THE TERMS AND CONDITIONS OF THIS AGREEMENT.
          </p>
        </div>
      </ScrollArea>
      <div className="flex justify-between space-x-4">
        <Button onClick={onDisagree} className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={!isBottom}>
          Disagree
        </Button>
        <Button
          onClick={onAgree}
          className="w-full bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-200 dark:text-black"
          disabled={!isBottom}
        >
          Agree
        </Button>
      </div>
    </div>
  )
}

