import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from './app.service';

@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getPrivacy(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Privacy Policy – OmniDesk</title></head>
<body>
  <h1>Privacy Policy</h1>
  <p>Last updated: June 2026</p>
  <p>OmniDesk Dev is a development application used for internal testing of customer support integrations with Meta platforms.</p>
  <h2>Data We Collect</h2>
  <p>We collect messages and page comments sent to connected Facebook Pages solely for the purpose of customer support management.</p>
  <h2>How We Use Data</h2>
  <p>Data is used only to provide support responses through the OmniDesk platform and is not shared with third parties.</p>
  <h2>Contact</h2>
  <p>For questions, contact: ryantbnguyen27425@gmail.com</p>
</body>
</html>`;
  }
}
