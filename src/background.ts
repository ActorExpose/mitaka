import { browser, ContextMenus, Extension } from "webextension-polyfill-ts";

import { Command } from "./lib/command";
import { Selector } from "./lib/selector";
import {
  AnalyzerEntry,
  SearcherStates,
  UpdateContextMenuMessage,
} from "./lib/types";
import { getApiKeys } from "./utility";

const FIRST_INDEX_WITHOUT_TEXT_ANALYZERS = 3;

export async function showNotification(message: string): Promise<void> {
  await browser.notifications.create({
    iconUrl: "./icons/48.png",
    message,
    title: "Mitaka",
    type: "basic",
  });
}

export async function search(command: Command): Promise<void> {
  try {
    const url: string = command.search();
    if (url !== "") {
      await browser.tabs.create({ url });
    }
  } catch (e) {
    const err = <Extension.PropertyLastErrorType>e;
    await showNotification(err.message);
  }
}

export async function searchAll(command: Command): Promise<void> {
  try {
    const config = await browser.storage.sync.get("searcherStates");
    const states: SearcherStates = <SearcherStates>(
      ("searcherStates" in config ? config["searcherStates"] : {})
    );
    const urls = command.searchAll(states);
    for (const url of urls) {
      await browser.tabs.create({ url });
    }
  } catch (e) {
    const err = <Extension.PropertyLastErrorType>e;
    await showNotification(err.message);
  }
}

export async function scan(command: Command): Promise<void> {
  const apiKeys = await getApiKeys();
  try {
    const url: string = await command.scan(apiKeys);
    if (url !== "") {
      await browser.tabs.create({ url });
    }
  } catch (e) {
    const err = <Extension.PropertyLastErrorType>e;
    await showNotification(err.message);
  }
}

export function createContextMenuErrorHandler(): void {
  if (browser.runtime.lastError) {
    console.error(browser.runtime.lastError.message);
  }
}

export async function createContextMenus(
  message: UpdateContextMenuMessage,
  searcherStates: SearcherStates
): Promise<void> {
  await browser.contextMenus.removeAll();

  const text: string = message.selection;
  const selector: Selector = new Selector(text);
  // create searchers context menus based on a type of the input
  const searcherEntries: AnalyzerEntry[] = selector.getSearcherEntries();
  for (const entry of searcherEntries) {
    const name = entry.analyzer.name;
    // continue if a searcher is disabled in options
    if (name in searcherStates && !searcherStates[name]) {
      continue;
    }
    // it tells action/query/type/target to the listner
    const id = `Search ${entry.query} as a ${entry.type} on ${name}`;
    const title = `Search this ${entry.type} on ${name}`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }
  // search it on all services
  if (searcherEntries.length >= FIRST_INDEX_WITHOUT_TEXT_ANALYZERS) {
    const query = searcherEntries[FIRST_INDEX_WITHOUT_TEXT_ANALYZERS].query;
    const type = searcherEntries[FIRST_INDEX_WITHOUT_TEXT_ANALYZERS].type;
    const id = `Search ${query} as a ${type} on all`;
    const title = `Search this ${type} on all`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }

  // create scanners context menus based on a type of the input
  const scannerEntries: AnalyzerEntry[] = selector.getScannerEntries();
  for (const entry of scannerEntries) {
    const name = entry.analyzer.name;
    // it tells action/query/type/target to the listner
    const id = `Scan ${entry.query} as a ${entry.type} on ${name}`;
    const title = `Scan this ${entry.type} on ${name}`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }
}

if (typeof browser !== "undefined" && browser.runtime !== undefined) {
  browser.runtime.onMessage.addListener(
    async (message: UpdateContextMenuMessage): Promise<void> => {
      if (message.request === "updateContextMenu") {
        const config = await browser.storage.sync.get("searcherStates");
        if ("searcherStates" in config) {
          const searcherStates = <SearcherStates>config["searcherStates"];
          await createContextMenus(message, searcherStates);
        } else {
          await createContextMenus(message, {});
        }
      }
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  browser.contextMenus.onClicked.addListener(async (info, tab_) => {
    const id: string = info.menuItemId.toString();
    const command = new Command(id);
    switch (command.action) {
      case "search":
        if (command.target === "all") {
          await searchAll(command);
        } else {
          await search(command);
        }
        break;
      case "scan":
        await scan(command);
        break;
    }
  });
}
