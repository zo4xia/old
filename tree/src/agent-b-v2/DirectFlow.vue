<script setup>
/* @qh-core LANE=B-V2 POINT=FLOW step1<->agentB page switch */
import { ref, watch } from 'vue'
import Step1Entry from '../components/Step1Entry.vue'
import AgentBDirect from './AgentBDirect.vue'
import { message } from 'ant-design-vue'

const page = ref('step1')
const handoff = ref(null)

watch(page, (value) => {
  document.title = value === 'agent-b' ? '生成 · Agent B 五字段' : '教学板书 · 第1步 贴题识别'
}, { immediate: true })

function enterAgentB(payload) {
  // ★ 2026-09-22 实时交接（用户拍板）：直接使用第 1 步确认时刚构建的 handoff payload
  //   （buildStep1Handoff 从当前界面状态现算），不再回读 /api/handoff 旧存档。
  //   存档写入仍由第 1 步负责（供修缮/校验等文件链路使用），但 B 页入口只认这份实时 payload。
  if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
    handoff.value = payload
    page.value = 'agent-b'
  } else {
    message.error('交接数据缺失，请先在第 1 步确认题目')
  }
}

function backToStep1() {
  page.value = 'step1'
}
</script>

<template>
  <Step1Entry v-if="page === 'step1'" @enter-board-draft="enterAgentB" />
  <AgentBDirect v-else :initial-handoff="handoff" @back-to-step1="backToStep1" />
</template>
