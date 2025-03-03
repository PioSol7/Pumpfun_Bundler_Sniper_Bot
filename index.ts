import { main_menu_display, rl, screen_clear, security_checks_display } from "./menu/menu";
import { sleep } from "./utils"
import { create_Buy } from "./createBuy";
import { sell_all } from "./sellAll";
import { gather_wallet } from "./gather";
import { monitoring } from "./monitor"
import { toExternal } from "./toExternal"
import { prepare } from "./prepare"

export const init = async () => {
  try {

    screen_clear();
    console.log("Pumpfun Bundler Launchpad");

    main_menu_display();

    rl.question("\t[Main] - Choice: ", (answer: string) => {
      let choice = parseInt(answer);
      switch (choice) {
        case 1:
          prepare();
          break;
        case 2:
          create_Buy();
          break;
        case 3:
          sell_all()
          break;
        case 4:
          gather_wallet();
          break;
        case 5:
          monitoring();
          break;
        case 6:
          process.exit(1);
        default:
          console.log("\tInvalid choice!");
          sleep(1500);
          init();
          break;
      }
    })
  } catch (error) {
    console.log(error)
  }
}

export const security_checks = () => {
  screen_clear();
  console.log("Security Checks")
  security_checks_display();
}

init()