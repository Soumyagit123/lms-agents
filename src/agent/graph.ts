import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState } from './state';
import { dataFetcherNode } from './nodes/01-dataFetcher';
import { preprocessorNode } from './nodes/02-preprocessor';
import { subjectAnalyzerNode } from './nodes/03-subjectAnalyzer';
import { riskScorerNode } from './nodes/04-riskScorer';
import { feedbackGeneratorNode } from './nodes/05-feedbackGenerator';
import { adminRecommenderNode } from './nodes/06-adminRecommender';
import { reportBuilderNode } from './nodes/07-reportBuilder';

// Initialize the StateGraph with the AgentState schema
const workflow = new StateGraph(AgentState)
  .addNode('dataFetcher', dataFetcherNode)
  .addNode('preprocessor', preprocessorNode)
  .addNode('subjectAnalyzer', subjectAnalyzerNode)
  .addNode('riskScorer', riskScorerNode)
  .addNode('feedbackGenerator', feedbackGeneratorNode)
  .addNode('adminRecommender', adminRecommenderNode)
  .addNode('reportBuilder', reportBuilderNode)
  
  // Define linear edges between the sequential nodes
  .addEdge(START, 'dataFetcher')
  .addEdge('dataFetcher', 'preprocessor')
  .addEdge('preprocessor', 'subjectAnalyzer')
  .addEdge('subjectAnalyzer', 'riskScorer')
  .addEdge('riskScorer', 'feedbackGenerator')
  .addEdge('feedbackGenerator', 'adminRecommender')
  .addEdge('adminRecommender', 'reportBuilder')
  .addEdge('reportBuilder', END);

// Compile the graph into an executable Pregel application
export const graph = workflow.compile();
export type GraphType = typeof graph;
export { AgentState };
